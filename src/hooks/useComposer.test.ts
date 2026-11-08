import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const { transcriptMock, invokeMock, sessionStoreMock } = vi.hoisted(() => ({
  transcriptMock: { isStreaming: false, addUserMessage: vi.fn() },
  invokeMock: vi.fn(),
  sessionStoreMock: {
    getState: vi.fn(() => ({ sessions: [{ id: 's1', cwd: '/work', alive: true }] })),
    spawnSession: vi.fn(async () => 's2'),
  },
}))

vi.mock('@/hooks/useTranscript', () => ({
  useTranscript: () => transcriptMock,
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

vi.mock('@/lib/sessionStore', () => ({ sessionStore: sessionStoreMock }))

import { useComposer } from '@/hooks/useComposer'

beforeEach(() => {
  transcriptMock.isStreaming = false
  transcriptMock.addUserMessage.mockReset()
  invokeMock.mockReset()
  sessionStoreMock.getState.mockClear()
  sessionStoreMock.spawnSession.mockClear()
})

describe('useComposer', () => {
  it('adds the user message first, then invokes send_prompt with camelCase keys', async () => {
    const order: string[] = []
    transcriptMock.addUserMessage.mockImplementation(() => {
      order.push('addUserMessage')
    })
    invokeMock.mockImplementation(() => {
      order.push('invoke')
      return Promise.resolve(undefined)
    })

    const { result } = renderHook(() => useComposer('s1'))
    act(() => result.current.setState((prev) => ({ ...prev, value: 'hello' })))

    await act(async () => {
      await result.current.sendPrompt()
    })

    expect(order).toEqual(['addUserMessage', 'invoke'])
    expect(transcriptMock.addUserMessage).toHaveBeenCalledWith('hello')
    expect(invokeMock).toHaveBeenCalledWith('send_prompt', { sessionId: 's1', prompt: 'hello' })
    expect(result.current.state.value).toBe('')
  })

  it('restores the input and reports an error when send_prompt fails', async () => {
    invokeMock.mockRejectedValue(new Error('host gone'))

    const { result } = renderHook(() => useComposer('s1'))
    act(() => result.current.setState((prev) => ({ ...prev, value: 'keep me' })))

    await act(async () => {
      await result.current.sendPrompt()
    })

    expect(result.current.state.value).toBe('keep me')
    expect(result.current.sendError).toBe('host gone')
    expect(result.current.isRunning).toBe(false)
  })

  it('unlocks the composer when the host accepts a prompt but never streams', async () => {
    invokeMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useComposer('s1'))
    act(() => result.current.setState((prev) => ({ ...prev, value: 'no stream' })))

    await act(async () => {
      await result.current.sendPrompt()
    })

    expect(result.current.isRunning).toBe(false)
  })

  it('sends /switch text verbatim without intercepting or rewriting it', async () => {
    invokeMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useComposer('s1'))
    act(() => result.current.setState((prev) => ({ ...prev, value: '/switch some-model' })))

    await act(async () => {
      await result.current.sendPrompt()
    })

    // /switch is an omp built-in command: the composer passes the raw text
    // through as an ordinary prompt and never rewrites the token.
    expect(transcriptMock.addUserMessage).toHaveBeenCalledWith('/switch some-model')
    expect(invokeMock).toHaveBeenCalledWith('send_prompt', {
      sessionId: 's1',
      prompt: '/switch some-model',
    })
  })

  it('derives the running state from isStreaming', () => {
    const { result, rerender } = renderHook(() => useComposer('s1'))

    expect(result.current.isRunning).toBe(false)

    transcriptMock.isStreaming = true
    rerender()
    expect(result.current.isRunning).toBe(true)

    transcriptMock.isStreaming = false
    rerender()
    expect(result.current.isRunning).toBe(false)
  })

  it('aborts with the camelCase sessionId and clears the running state', async () => {
    let release: () => void = () => {}
    invokeMock.mockImplementation((command: string) => {
      if (command === 'abort') return Promise.resolve(undefined)
      return new Promise<void>((resolve) => {
        release = resolve
      })
    })

    const { result } = renderHook(() => useComposer('s1'))
    act(() => result.current.setState((prev) => ({ ...prev, value: 'x' })))
    act(() => {
      void result.current.sendPrompt()
    })
    // Optimistic running state while the prompt is in flight.
    expect(result.current.isRunning).toBe(true)

    await act(async () => {
      await result.current.stop()
    })

    expect(invokeMock).toHaveBeenCalledWith('abort', { sessionId: 's1' })
    expect(result.current.isRunning).toBe(false)
    // The host kills the child on abort, so the composer replaces the dead
    // session with one in the same working directory (review D7).
    expect(sessionStoreMock.spawnSession).toHaveBeenCalledWith('/work')

    await act(async () => {
      release()
    })
  })
})
