import { describe, expect, it } from 'vitest'
import { assertSafePreviewUrl, DEFAULT_PREVIEW_URL, normalizePreviewUrl } from './usePreview'

describe('normalizePreviewUrl', () => {
  it('accepts absolute http and https URLs', () => {
    expect(normalizePreviewUrl('https://example.com')).toBe('https://example.com/')
    expect(normalizePreviewUrl('http://localhost:1420')).toBe('http://localhost:1420/')
  })

  it('adds https:// when the scheme is missing', () => {
    expect(normalizePreviewUrl('example.com/path')).toBe('https://example.com/path')
    expect(normalizePreviewUrl('  example.com  ')).toBe('https://example.com/')
  })

  it('rejects non-http(s) schemes', () => {
    expect(normalizePreviewUrl('javascript:alert(1)')).toBeNull()
    expect(normalizePreviewUrl('data:text/html,<h1>hi</h1>')).toBeNull()
    expect(normalizePreviewUrl('file:///etc/passwd')).toBeNull()
    expect(normalizePreviewUrl('vbscript:msgbox(1)')).toBeNull()
  })

  it('rejects empty input', () => {
    expect(normalizePreviewUrl('')).toBeNull()
    expect(normalizePreviewUrl('   ')).toBeNull()
  })

  it('rejects input that is not a URL', () => {
    expect(normalizePreviewUrl('not a url')).toBeNull()
  })

  it('exposes the default preview URL as a valid value', () => {
    expect(normalizePreviewUrl(DEFAULT_PREVIEW_URL)).toBe('https://example.com/')
  })
})

describe('assertSafePreviewUrl', () => {
  it('returns the normalized URL for safe http(s) input', () => {
    expect(assertSafePreviewUrl('https://example.com')).toBe('https://example.com/')
    expect(assertSafePreviewUrl('http://localhost:1420')).toBe('http://localhost:1420/')
    expect(assertSafePreviewUrl('example.com/path')).toBe('https://example.com/path')
  })

  it('rejects tauri://, file:// and javascript: URLs', () => {
    expect(() => assertSafePreviewUrl('tauri://localhost/x')).toThrow()
    expect(() => assertSafePreviewUrl('file:///etc/passwd')).toThrow()
    expect(() => assertSafePreviewUrl('javascript:alert(1)')).toThrow()
  })

  it('rejects any other non-http(s) URL', () => {
    expect(() => assertSafePreviewUrl('data:text/html,<h1>hi</h1>')).toThrow()
    expect(() => assertSafePreviewUrl('vbscript:msgbox(1)')).toThrow()
    expect(() => assertSafePreviewUrl('ftp://example.com/file')).toThrow()
  })

  it('rejects empty or non-URL input', () => {
    expect(() => assertSafePreviewUrl('')).toThrow()
    expect(() => assertSafePreviewUrl('not a url')).toThrow()
  })
})
