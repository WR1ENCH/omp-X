import { describe, expect, it } from 'vitest'
import { localUnifiedDiff, parseUnifiedDiff } from './useDiff'

describe('parseUnifiedDiff', () => {
  it('parses a standard unified diff with context lines', () => {
    const text = [
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,3 @@',
      ' line one',
      '-line two',
      '+line TWO',
      ' line three',
    ].join('\n')

    const hunks = parseUnifiedDiff(text)

    expect(hunks).toHaveLength(1)
    const [hunk] = hunks
    expect(hunk.oldStart).toBe(1)
    expect(hunk.oldLines).toBe(3)
    expect(hunk.newStart).toBe(1)
    expect(hunk.newLines).toBe(3)
    expect(hunk.lines.map((line) => line.type)).toEqual(['context', 'remove', 'add', 'context'])
    expect(hunk.lines[0]).toMatchObject({ content: 'line one', oldLineNumber: 1, newLineNumber: 1 })
    expect(hunk.lines[1]).toMatchObject({ content: 'line two', oldLineNumber: 2, newLineNumber: null })
    expect(hunk.lines[2]).toMatchObject({ content: 'line TWO', oldLineNumber: null, newLineNumber: 2 })
    expect(hunk.lines[3]).toMatchObject({ content: 'line three', oldLineNumber: 3, newLineNumber: 3 })
  })

  it('parses the Rust backend reduced format (no headers, no context, zero counts)', () => {
    // Mirrors crates/omp-tauri compute_unified_diff output for "a\nb\nc" ->
    // "a\nb\nc\nd": one removal hunk and one insertion hunk with count 0.
    const text = '@@ -1,2 +1,0 @@\n-a\n-b\n@@ -3,0 +3,1 @@\n+d\n'

    const hunks = parseUnifiedDiff(text)

    expect(hunks).toHaveLength(2)
    expect(hunks[0]).toMatchObject({ oldStart: 1, oldLines: 2, newStart: 1, newLines: 0 })
    expect(hunks[0].lines.map((line) => line.type)).toEqual(['remove', 'remove'])
    expect(hunks[1]).toMatchObject({ oldStart: 3, oldLines: 0, newStart: 3, newLines: 1 })
    expect(hunks[1].lines.map((line) => line.type)).toEqual(['add'])
  })

  it('treats `--- `-looking content inside a hunk as a removal', () => {
    // Raw line `--- old heading` is a removal whose content is `-- old heading`.
    const text = '@@ -1,1 +1,1 @@\n--- old heading\n+++ new heading\n'

    const hunks = parseUnifiedDiff(text)

    expect(hunks).toHaveLength(1)
    expect(hunks[0].lines.map((line) => `${line.type}:${line.content}`)).toEqual([
      'remove:-- old heading',
      'add:++ new heading',
    ])
  })

  it('ignores a trailing newline and blank separators', () => {
    const text = '@@ -1,1 +1,1 @@\n-a\n+b\n\n'

    const hunks = parseUnifiedDiff(text)

    expect(hunks[0].lines).toHaveLength(2)
  })

  it('returns an empty array for empty input', () => {
    expect(parseUnifiedDiff('')).toEqual([])
  })
})

describe('localUnifiedDiff', () => {
  it('returns an empty string when the content is identical', () => {
    expect(localUnifiedDiff('a\nb\n', 'a\nb\n')).toBe('')
  })

  it('round-trips through parseUnifiedDiff', () => {
    const text = localUnifiedDiff('one\ntwo\nthree\n', 'one\nTWO\nthree\nfour\n')
    const hunks = parseUnifiedDiff(text)

    expect(hunks).toHaveLength(1)
    expect(hunks[0].lines.map((line) => line.type)).toEqual([
      'context',
      'remove',
      'add',
      'context',
      'add',
    ])
  })

  it('does not invent an extra line for a trailing newline', () => {
    const text = localUnifiedDiff('a\n', 'a\nb\n')

    expect(text).toContain('+b')
    expect(text).not.toContain('+b\n+')
  })

  it('handles CRLF input', () => {
    const text = localUnifiedDiff('a\r\nb\r\n', 'a\r\nc\r\n')

    expect(parseUnifiedDiff(text)[0].lines.map((line) => line.type)).toEqual([
      'context',
      'remove',
      'add',
    ])
  })

  it('produces a single all-remove/all-add hunk for very large inputs', () => {
    const oldContent = Array.from({ length: 2000 }, (_, i) => `old-${i}`).join('\n')
    const newContent = Array.from({ length: 2000 }, (_, i) => `new-${i}`).join('\n')

    const text = localUnifiedDiff(oldContent, newContent)
    const hunks = parseUnifiedDiff(text)

    expect(hunks).toHaveLength(1)
    expect(hunks[0].oldLines).toBe(2000)
    expect(hunks[0].newLines).toBe(2000)
  })
})
