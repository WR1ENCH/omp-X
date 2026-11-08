import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const { invokeRequiredMock } = vi.hoisted(() => ({ invokeRequiredMock: vi.fn() }))

// `isTauri()` is forced off so the provider uses the documented window-event
// fallback, which is what a browser-preview build gets from `useTranscript`.
vi.mock('@/lib/tauri', () => ({
  isTauri: () => false,
  invokeSafe: vi.fn(async () => null),
  invokeRequired: invokeRequiredMock,
}))

import {
  APPROVAL_TIMEOUT_MS,
  ApprovalProvider,
  useApproval,
} from '@/hooks/useApproval'

function renderApproval(sessionId: string | null = 's1') {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApprovalProvider sessionId={sessionId}>{children}</ApprovalProvider>
  )
  return renderHook(() => useApproval(), { wrapper })
}

/** Mirrors the `{ id, request: {...} }` detail `useTranscript` dispatches. */
function dispatchRequest(
  id: string,
  request: { method: string; title?: string; options?: string[]; extra?: Record<string, unknown> },
) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent('omp:ui-request', { detail: { id, request } }),
    )
  })
}

beforeEach(() => {
  invokeRequiredMock.mockReset()
  invokeRequiredMock.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ApprovalProvider', () => {
  it('never puts notification methods into pendingRequests', async () => {
    const { result } = renderApproval()

    dispatchRequest('n1', { method: 'notify', title: 'Hello', extra: { type: 'info' } })
    dispatchRequest('n2', { method: 'setStatus', title: 'Working', extra: { key: 'k1' } })
    dispatchRequest('n3', {
      method: 'setWidget',
      extra: { widgetKey: 'w1', lines: ['a', 'b'] },
    })
    dispatchRequest('n4', { method: 'setTitle', title: 'My title' })

    await waitFor(() => expect(result.current.titleItem).toBe('My title'))

    expect(result.current.pendingRequests.size).toBe(0)
    expect(result.current.toasts.map((toast) => toast.message)).toEqual(['Hello'])
    expect(result.current.statusItems).toEqual([
      { key: 'k1', text: 'Working', timestamp: expect.any(Number) },
    ])
    expect(result.current.widgetItems).toEqual([
      { widgetKey: 'w1', lines: ['a', 'b'], timestamp: expect.any(Number) },
    ])
  })

  it('maps select/confirm/input/editor into pendingRequests', async () => {
    const { result } = renderApproval()

    dispatchRequest('r0', { method: 'select', title: 'Pick', options: ['alpha', 'beta'] })
    dispatchRequest('r1', { method: 'confirm', title: 'Sure?' })
    dispatchRequest('r2', { method: 'input', title: 'Name' })
    dispatchRequest('r3', { method: 'editor', title: 'Edit' })

    await waitFor(() => expect(result.current.pendingRequests.size).toBe(4))
    expect(
      [...result.current.pendingRequests.values()].map((request) => request.method),
    ).toEqual(['select', 'confirm', 'input', 'editor'])
    expect(result.current.pendingRequests.get('r0')?.options).toEqual(['alpha', 'beta'])
  })

  it('responds with the raw select option and drops the request after a success', async () => {
    const { result } = renderApproval()
    dispatchRequest('r1', { method: 'select', title: 'Pick', options: ['alpha', 'beta'] })
    await waitFor(() => expect(result.current.pendingRequests.has('r1')).toBe(true))

    await act(async () => {
      await result.current.respond('r1', 'beta')
    })

    expect(invokeRequiredMock).toHaveBeenCalledWith('send_ui_response', {
      sessionId: 's1',
      requestId: 'r1',
      response: 'beta',
    })
    expect(result.current.pendingRequests.has('r1')).toBe(false)
  })

  it('answers a cancel with { cancelled: true }', async () => {
    const { result } = renderApproval()
    dispatchRequest('r1', { method: 'confirm', title: 'Sure?' })
    await waitFor(() => expect(result.current.pendingRequests.has('r1')).toBe(true))

    await act(async () => {
      await result.current.respond('r1', null, true)
    })

    expect(invokeRequiredMock).toHaveBeenCalledWith('send_ui_response', {
      sessionId: 's1',
      requestId: 'r1',
      response: { cancelled: true },
    })
    expect(result.current.pendingRequests.has('r1')).toBe(false)
  })

  it('keeps the request pending when the invoke fails', async () => {
    invokeRequiredMock.mockRejectedValue(new Error('ipc down'))
    const { result } = renderApproval()
    dispatchRequest('r1', { method: 'input', title: 'Name' })
    await waitFor(() => expect(result.current.pendingRequests.has('r1')).toBe(true))

    await act(async () => {
      await result.current.respond('r1', 'value')
    })

    expect(result.current.pendingRequests.has('r1')).toBe(true)
  })

  it('times out blocking requests but never the editor', async () => {
    vi.useFakeTimers()
    const { result } = renderApproval()
    dispatchRequest('r1', { method: 'confirm', title: 'Sure?' })
    dispatchRequest('r2', { method: 'editor', title: 'Edit' })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.pendingRequests.size).toBe(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(APPROVAL_TIMEOUT_MS)
    })

    expect(invokeRequiredMock).toHaveBeenCalledWith('send_ui_response', {
      sessionId: 's1',
      requestId: 'r1',
      response: { cancelled: true },
    })
    expect(result.current.pendingRequests.has('r1')).toBe(false)
    expect(result.current.pendingRequests.has('r2')).toBe(true)
  })
})
