import { useState, useCallback, useMemo } from 'react'
import { DiffState, DiffHunk, DiffLine } from '@/types/dock'
import { isTauri } from '@/lib/tauri'

/** Lines of context kept around each change when the local fallback renders a diff. */
const CONTEXT_LINES = 3
/**
 * The local fallback uses an O(n*m) LCS table. Past this many cells we fall
 * back to a single "everything removed, everything added" hunk instead of
 * allocating an unbounded matrix.
 */
const MAX_LCS_CELLS = 1_000_000
/** How many hunks `virtualizedHunks` exposes before `showMoreHunks` is called. */
export const HUNK_WINDOW_SIZE = 50

type DiffLineType = DiffLine['type']

interface DiffOp {
  type: DiffLineType
  content: string
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return 'Unknown error'
  }
}

function splitLines(content: string): string[] {
  if (content === '') return []
  const lines = content.split(/\r\n|\r|\n/)
  // A trailing newline terminates the last line; it does not create an extra one.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * Classic LCS diff. Ties prefer the "remove" branch so the output reads the
 * same way `diff` does for the common case.
 */
function diffOps(oldLines: string[], newLines: string[]): DiffOp[] {
  const n = oldLines.length
  const m = newLines.length

  if (n * m > MAX_LCS_CELLS) {
    return [
      ...oldLines.map((content): DiffOp => ({ type: 'remove', content })),
      ...newLines.map((content): DiffOp => ({ type: 'add', content })),
    ]
  }

  const table: Uint32Array[] = new Array(n + 1)
  for (let i = 0; i <= n; i++) table[i] = new Uint32Array(m + 1)

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        oldLines[i] === newLines[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: 'context', content: oldLines[i] })
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ type: 'remove', content: oldLines[i] })
      i++
    } else {
      ops.push({ type: 'add', content: newLines[j] })
      j++
    }
  }
  while (i < n) {
    ops.push({ type: 'remove', content: oldLines[i] })
    i++
  }
  while (j < m) {
    ops.push({ type: 'add', content: newLines[j] })
    j++
  }
  return ops
}

interface RawHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffOp[]
}

/** Groups a flat op list into unified-diff hunks with `CONTEXT_LINES` of context. */
function groupIntoHunks(ops: DiffOp[]): RawHunk[] {
  const changeIndices: number[] = []
  ops.forEach((op, index) => {
    if (op.type !== 'context') changeIndices.push(index)
  })
  if (changeIndices.length === 0) return []

  const ranges: Array<[number, number]> = []
  for (const index of changeIndices) {
    const start = Math.max(0, index - CONTEXT_LINES)
    const end = Math.min(ops.length - 1, index + CONTEXT_LINES)
    const last = ranges[ranges.length - 1]
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end)
    else ranges.push([start, end])
  }

  return ranges.map(([start, end]) => {
    let oldStart = 0
    let newStart = 0
    for (let k = 0; k < start; k++) {
      if (ops[k].type !== 'add') oldStart++
      if (ops[k].type !== 'remove') newStart++
    }

    const lines = ops.slice(start, end + 1)
    let oldCount = 0
    let newCount = 0
    for (const op of lines) {
      if (op.type !== 'add') oldCount++
      if (op.type !== 'remove') newCount++
    }

    return {
      // GNU diff reports the line *before* the insertion when a side has 0 lines.
      oldStart: oldCount === 0 ? oldStart : oldStart + 1,
      oldCount,
      newStart: newCount === 0 ? newStart : newStart + 1,
      newCount,
      lines,
    }
  })
}

function formatHunkHeader(hunk: RawHunk): string {
  const old = hunk.oldCount === 1 ? `${hunk.oldStart}` : `${hunk.oldStart},${hunk.oldCount}`
  const next = hunk.newCount === 1 ? `${hunk.newStart}` : `${hunk.newStart},${hunk.newCount}`
  return `@@ -${old} +${next} @@`
}

/**
 * Purely local fallback used when the Tauri runtime is unavailable (browser
 * dev). Produces the same unified-diff text the Rust `diff_compute` returns,
 * so both paths share one parser.
 */
export function localUnifiedDiff(oldContent: string, newContent: string): string {
  const hunks = groupIntoHunks(diffOps(splitLines(oldContent), splitLines(newContent)))
  if (hunks.length === 0) return ''

  const out = ['--- a/file', '+++ b/file']
  for (const hunk of hunks) {
    out.push(formatHunkHeader(hunk))
    for (const op of hunk.lines) {
      out.push(op.type === 'add' ? `+${op.content}` : op.type === 'remove' ? `-${op.content}` : ` ${op.content}`)
    }
  }
  return `${out.join('\n')}\n`
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/**
 * Parses unified-diff text into hunks.
 *
 * Handles both the standard format (`---`/`+++` headers, context lines,
 * `\ No newline at end of file`) and the Rust backend's reduced format, which
 * emits only `@@ -a,b +c,d @@` followed by `-` and `+` lines with no context
 * and no file headers. Counts of 0 (pure insert/delete) are accepted.
 */
export function parseUnifiedDiff(output: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  if (!output) return hunks

  const lines = output.split('\n')
  let current: DiffHunk | null = null
  let oldLineNum = 0
  let newLineNum = 0

  for (const raw of lines) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw

    const header = HUNK_HEADER.exec(line)
    if (header) {
      if (current) hunks.push(current)

      const oldStart = parseInt(header[1], 10)
      const newStart = parseInt(header[3], 10)
      const oldCount = header[2] === undefined ? 1 : parseInt(header[2], 10)
      const newCount = header[4] === undefined ? 1 : parseInt(header[4], 10)

      oldLineNum = oldStart - 1
      newLineNum = newStart - 1
      current = {
        id: `hunk-${hunks.length}`,
        oldStart,
        oldLines: oldCount,
        newStart,
        newLines: newCount,
        lines: [],
      }
      continue
    }

    if (!current) continue

    // Inside a hunk a leading `-`/`+` is content, so `---`/`+++` file headers
    // can only appear before the first hunk (handled by the `!current` guard).
    if (line.startsWith('\\')) continue

    let type: DiffLineType
    let content: string
    if (line.startsWith('+')) {
      type = 'add'
      content = line.slice(1)
      newLineNum++
    } else if (line.startsWith('-')) {
      type = 'remove'
      content = line.slice(1)
      oldLineNum++
    } else if (line.startsWith(' ')) {
      type = 'context'
      content = line.slice(1)
      oldLineNum++
      newLineNum++
    } else {
      // Blank separator or trailing newline from split().
      continue
    }

    current.lines.push({
      type,
      content,
      oldLineNumber: type === 'add' ? null : oldLineNum,
      newLineNumber: type === 'remove' ? null : newLineNum,
    })
  }

  if (current) hunks.push(current)
  return hunks
}

export type { DiffHunk, DiffLine }

export function useDiff() {
  const [state, setState] = useState<DiffState>({
    hunks: [],
    loading: false,
    error: null,
    filePath: null,
    oldContent: '',
    newContent: '',
  })
  const [visibleHunks, setVisibleHunks] = useState(HUNK_WINDOW_SIZE)

  const computeDiff = useCallback(async (oldContent: string, newContent: string, filePath?: string) => {
    setState((s) => ({ ...s, loading: true, error: null, filePath: filePath ?? null }))

    try {
      let diffOutput: string

      if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core')
        diffOutput = await invoke<string>('diff_compute', { oldContent, newContent })
      } else {
        diffOutput = localUnifiedDiff(oldContent, newContent)
      }

      const hunks = parseUnifiedDiff(diffOutput)
      setState((s) => ({
        ...s,
        hunks,
        loading: false,
        oldContent,
        newContent,
      }))
      setVisibleHunks(HUNK_WINDOW_SIZE)
    } catch (err) {
      console.error('[diff] compute failed', err)
      setState((s) => ({ ...s, loading: false, error: errorMessage(err) }))
    }
  }, [])

  const clear = useCallback(() => {
    setState({
      hunks: [],
      loading: false,
      error: null,
      filePath: null,
      oldContent: '',
      newContent: '',
    })
    setVisibleHunks(HUNK_WINDOW_SIZE)
  }, [])

  /**
   * Incremental windowing: only the first `visibleHunks` hunks are exposed.
   * `DiffTab` calls `showMoreHunks` as the user scrolls, which keeps the DOM
   * small for large diffs without pulling in a virtualization dependency.
   */
  const showMoreHunks = useCallback(() => {
    setVisibleHunks((count) => count + HUNK_WINDOW_SIZE)
  }, [])

  const virtualizedHunks = useMemo(
    () => state.hunks.slice(0, visibleHunks),
    [state.hunks, visibleHunks]
  )

  return {
    ...state,
    virtualizedHunks,
    totalHunks: state.hunks.length,
    hasMoreHunks: state.hunks.length > virtualizedHunks.length,
    computeDiff,
    clear,
    showMoreHunks,
  }
}

export type UseDiffReturn = ReturnType<typeof useDiff>
