import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OUTPUT_LIMIT,
  TRUNCATION_MARKER,
  extractFilePaths,
  extractResultText,
  formatToolArgs,
  formatToolResult,
  truncateOutput,
} from './toolOutput'

describe('extractFilePaths', () => {
  it('extracts absolute paths', () => {
    expect(extractFilePaths('Error: cannot open /home/user/proj/src/main.ts')).toEqual([
      '/home/user/proj/src/main.ts',
    ])
  })

  it('extracts home-relative and dot-relative paths', () => {
    expect(
      extractFilePaths('wrote ~/p/f.rs then ./tools/a.ts and ../b.rs and src/lib/utils.ts'),
    ).toEqual(['~/p/f.rs', './tools/a.ts', '../b.rs', 'src/lib/utils.ts'])
  })

  it('keeps :line and :line:col suffixes attached to the path', () => {
    expect(extractFilePaths('at /app/index.js:10:15 boom')).toEqual(['/app/index.js:10:15'])
    expect(extractFilePaths('src/main.ts:42')).toEqual(['src/main.ts:42'])
  })

  it('deduplicates while preserving first-seen order', () => {
    expect(extractFilePaths('/a.ts /b.ts /a.ts')).toEqual(['/a.ts', '/b.ts'])
  })

  it('ignores URLs, bare words, and punctuation-wrapped non-paths', () => {
    expect(
      extractFilePaths('see https://example.com/x and (no output) and version 1.2.3 done'),
    ).toEqual([])
  })

  it('strips trailing punctuation but keeps line:col suffixes', () => {
    expect(extractFilePaths('ran (/tmp/log.txt:1:1).')).toEqual(['/tmp/log.txt:1:1'])
  })

  it('extracts windows drive paths', () => {
    expect(extractFilePaths('opened C:\\Users\\foo\\file.txt')).toEqual([
      'C:\\Users\\foo\\file.txt',
    ])
  })
})

describe('truncateOutput', () => {
  it('returns the original text when under the limit', () => {
    const r = truncateOutput('short', 100)
    expect(r).toEqual({ text: 'short', truncated: false })
  })

  it('keeps the head and appends the truncation marker when over the limit', () => {
    const long = 'x'.repeat(DEFAULT_OUTPUT_LIMIT + 50)
    const r = truncateOutput(long)
    expect(r.truncated).toBe(true)
    expect(r.text.startsWith('x'.repeat(DEFAULT_OUTPUT_LIMIT))).toBe(true)
    expect(r.text.length).toBe(DEFAULT_OUTPUT_LIMIT + TRUNCATION_MARKER.length)
    expect(r.text.endsWith(TRUNCATION_MARKER)).toBe(true)
  })

  it('respects an explicit limit', () => {
    const r = truncateOutput('abcdefghij', 4)
    expect(r).toEqual({ text: 'abcd' + TRUNCATION_MARKER, truncated: true })
  })
})

describe('formatToolArgs / formatToolResult / extractResultText', () => {
  it('pretty-prints args as indented JSON', () => {
    expect(formatToolArgs({ command: 'ls' })).toBe('{\n  "command": "ls"\n}')
  })

  it('stringifies non-JSON-safe args without throwing', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => formatToolArgs(circular)).not.toThrow()
    expect(typeof formatToolArgs(circular)).toBe('string')
  })

  it('unwraps the content[{text}] result envelope', () => {
    expect(extractResultText({ content: [{ type: 'text', text: '(no output)' }] })).toBe(
      '(no output)',
    )
    expect(extractResultText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe(
      'a\nb',
    )
  })

  it('falls back to JSON for plain objects and to String for scalars', () => {
    expect(extractResultText({ hello: 'world' })).toBe('{\n  "hello": "world"\n}')
    expect(extractResultText(42)).toBe('42')
    expect(extractResultText('plain')).toBe('plain')
  })

  it('formatToolResult renders JSON for objects', () => {
    expect(formatToolResult({ ok: true }, false)).toContain('"ok": true')
  })
})
