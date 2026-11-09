import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { SessionInfo } from '@/types/ipc'

const { invokeRequiredMock } = vi.hoisted(() => ({ invokeRequiredMock: vi.fn() }))

vi.mock('@/lib/tauri', () => ({
  isTauri: () => true,
  invokeSafe: vi.fn(async () => null),
  invokeRequired: invokeRequiredMock,
}))

import { __resetSessionStoreForTest } from '@/lib/sessionStore'
import { useSession } from '@/hooks/useSession'

const info = (id: string, cwd = '~'): SessionInfo => ({ id, cwd, alive: true, createdAt: 1 })

/** Route `invokeRequired` by command name. */
function route(handlers: Record<string, () => unknown>): void {
  invokeRequiredMock.mockImplementation((command: string) => {
    const handler = handlers[command]
    if (!handler) throw new Error(`unexpected command: ${command}`)
    return Promise.resolve(handler())
  })
}

beforeEach(() => {
  __resetSessionStoreForTest()
  invokeRequiredMock.mockReset()
})

describe('useSession', () => {
  it('lists host sessions and auto-spawns one when the host has none', async () => {
    route({
      list_sessions: () => [],
      spawn_session: () => ({ sessionId: 's1', cwd: '~' }),
    })

    const { result } = renderHook(() => useSession())

    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(result.current.sessions.map((session) => session.id)).toEqual(['s1'])
    expect(result.current.activeSessionId).toBe('s1')
    expect(result.current.activeSession?.id).toBe('s1')
    expect(result.current.error).toBeNull()
    expect(invokeRequiredMock).toHaveBeenCalledWith('list_sessions')
    expect(invokeRequiredMock).toHaveBeenCalledWith('spawn_session', { cwd: '~', extraArgs: [] })
  })

  it('keeps the active session when the list is refreshed', async () => {
    let sessions: SessionInfo[] = [info('a'), info('b')]
    route({ list_sessions: () => sessions })

    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.sessions).toHaveLength(2))

    act(() => result.current.selectSession('b'))
    expect(result.current.activeSessionId).toBe('b')

    sessions = [info('a'), info('b'), info('c')]
    await act(async () => {
      await result.current.refreshSessions()
    })

    expect(result.current.sessions.map((session) => session.id)).toEqual(['a', 'b', 'c'])
    expect(result.current.activeSessionId).toBe('b')
  })

  it('selects a known session and ignores unknown ids', async () => {
    route({ list_sessions: () => [info('a'), info('b')] })

    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.sessions).toHaveLength(2))

    expect(result.current.activeSessionId).toBe('a')

    act(() => result.current.selectSession('b'))
    expect(result.current.activeSessionId).toBe('b')
    expect(result.current.activeSession?.id).toBe('b')

    act(() => result.current.selectSession('does-not-exist'))
    expect(result.current.activeSessionId).toBe('b')
  })

  it('spawns with the given cwd/extraArgs and selects the new session', async () => {
    route({
      list_sessions: () => [info('a')],
      spawn_session: () => ({ sessionId: 's9', cwd: '/tmp/work' }),
    })

    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.sessions).toHaveLength(1))

    let spawned = ''
    await act(async () => {
      spawned = await result.current.spawnSession('/tmp/work', ['--verbose'])
    })

    expect(spawned).toBe('s9')
    expect(invokeRequiredMock).toHaveBeenCalledWith('spawn_session', {
      cwd: '/tmp/work',
      extraArgs: ['--verbose'],
    })
    expect(result.current.activeSessionId).toBe('s9')
    expect(result.current.sessions.map((session) => session.id)).toEqual(['a', 's9'])
  })

  it('closes the active session and falls back to the next one', async () => {
    route({
      list_sessions: () => [info('a'), info('b')],
      close_session: () => undefined,
    })

    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.sessions).toHaveLength(2))

    await act(async () => {
      await result.current.closeSession('a')
    })

    expect(invokeRequiredMock).toHaveBeenCalledWith('close_session', { sessionId: 'a' })
    expect(result.current.sessions.map((session) => session.id)).toEqual(['b'])
    expect(result.current.activeSessionId).toBe('b')
  })

  it('drops a session when the host reports it closed', async () => {
    route({ list_sessions: () => [info('a'), info('b')] })

    const { result } = renderHook(() => useSession())
    await waitFor(() => expect(result.current.sessions).toHaveLength(2))

    act(() => {
      window.dispatchEvent(
        new CustomEvent('omp:session-closed', { detail: { sessionId: 'a' } }),
      )
    })

    expect(result.current.sessions.map((session) => session.id)).toEqual(['b'])
    expect(result.current.activeSessionId).toBe('b')
  })

  it('records an error and becomes ready when listing fails', async () => {
    invokeRequiredMock.mockRejectedValue(new Error('host unavailable'))

    const { result } = renderHook(() => useSession())

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.error).toBe('host unavailable')
    expect(result.current.sessions).toEqual([])
    expect(result.current.activeSessionId).toBeNull()
  })
})
