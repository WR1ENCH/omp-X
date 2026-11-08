/**
 * Pure helpers for rendering tool output inside transcript tool cards.
 *
 * Covers the M3 card contract: extract clickable file paths from tool output,
 * cap displayed output at the first 10KB with a truncation marker, and
 * normalize tool args / results into display strings.
 */

/** Cap for the output preview shown inside an expanded tool card. */
export const DEFAULT_OUTPUT_LIMIT = 10 * 1024

/** Appended to the preview when output exceeds the limit. */
export const TRUNCATION_MARKER = '\n\n… [output truncated]'

/**
 * A file path with an optional `:line` / `:line:col` suffix.
 *
 * Branches:
 *  - absolute:          /home/u/proj/src/main.ts
 *  - home-relative:     ~/p/f.rs
 *  - dot-relative:      ./tools/a.ts, ../b.rs
 *  - bare dir-relative: src/lib/utils.ts
 *  - windows drive:     C:\\Users\\foo\\file.txt
 *
 * The leading guard rejects matches preceded by a word character, path
 * separator, `~`, `@` or `:` so URLs (https://…) and `host:path` labels are
 * skipped; the trailing lookahead rejects partial matches glued to a word
 * character or another `:` (malformed `a:b:c:d` suffixes).
 */
const FILE_PATH_PATTERN =
  /(?:^|[^\w~./\\@:])((\/[\w@.+-]*\/?|\.{1,2}\/|~\/)(?:[\w@.+-]+\/?)*(?:[\w@.+-]*)?(?::\d+){0,2}|[A-Za-z]:(?:[\\/](?:[\w@.+-]+[\\/]?)*[\w@.+-]*)?(?::\d+){0,2}|(?:[\w@.+-]+\/)+[\w@.+-]*(?::\d+){0,2})(?![\w:])/g

/**
 * Extract the file paths mentioned in a piece of tool output.
 *
 * Returns unique paths in first-seen order, keeping any `:line` / `:line:col`
 * suffix attached so callers can route line-precise references to the diff
 * dock and bare paths to the preview dock.
 */
export function extractFilePaths(text: string): string[] {
  const results: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(FILE_PATH_PATTERN)) {
    const path = match[1]
    if (!path || seen.has(path)) continue
    seen.add(path)
    results.push(path)
  }
  return results
}

export interface TruncatedOutput {
  text: string
  truncated: boolean
}

/**
 * Keep the first `limit` characters of `text`. When the text is longer, the
 * remainder is dropped and a truncation marker is appended.
 */
export function truncateOutput(text: string, limit: number = DEFAULT_OUTPUT_LIMIT): TruncatedOutput {
  if (text.length <= limit) return { text, truncated: false }
  return { text: text.slice(0, limit) + TRUNCATION_MARKER, truncated: true }
}

/** Pretty-print tool args; fall back to String() for non-JSON-safe values. */
export function formatToolArgs(args: unknown): string {
  try {
    const json = JSON.stringify(args, null, 2)
    return json === undefined ? String(args) : json
  } catch {
    return String(args)
  }
}

/** Render a tool result: errors stringify, strings pass through, else JSON. */
export function formatToolResult(result: unknown, isError: boolean): string {
  if (isError) return String(result)
  if (typeof result === 'string') return result
  return formatToolArgs(result)
}

/**
 * Unwrap the transcript result envelope `{ content: [{ type: 'text', text }] }`
 * into a single display string. Nested content arrays join with newlines.
 */
export function extractResultText(result: unknown): string {
  if (typeof result === 'string') return result
  if (Array.isArray(result)) return result.map(extractResultText).join('\n')
  if (result !== null && result !== undefined && typeof result === 'object') {
    const bag = result as Record<string, unknown>
    if (Array.isArray(bag.content)) return bag.content.map(extractResultText).join('\n')
    if (bag.text !== undefined) return extractResultText(bag.text)
  }
  return formatToolResult(result, false)
}
