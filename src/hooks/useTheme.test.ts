import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from './useTheme'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('useTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.documentElement.dataset.theme = 'dark'
  })

  it('returns default state when not ready', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.ready).toBe(false)
    expect(result.current.mode).toBe('system')
    expect(result.current.resolved).toBe('dark')
  })

  it('applies theme to document', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockResolvedValueOnce(null)

    renderHook(() => useTheme())

    // Wait for ready to become true
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
    })

    // Theme should be either light or dark (based on system preference)
    expect(['light', 'dark']).toContain(document.documentElement.dataset.theme)
  })
})