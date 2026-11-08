import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { sessionStore } from '@/lib/sessionStore'
import type { SessionSummary } from '@/types/session'

export interface SessionApi {
  sessions: SessionSummary[]
  activeSessionId: string | null
  activeSession: SessionSummary | null
  ready: boolean
  error: string | null
  spawnSession: (cwd?: string, extraArgs?: string[]) => Promise<string>
  closeSession: (id?: string) => Promise<void>
  selectSession: (id: string) => void
  refreshSessions: () => Promise<void>
}

/**
 * Read the external session store. The store is hydrated once on first mount:
 * it lists host sessions and spawns a default session when none exist.
 */
export function useSession(): SessionApi {
  const snapshot = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getSnapshot)

  useEffect(() => {
    void sessionStore.hydrate()
  }, [])

  const activeSession = useMemo(
    () => snapshot.sessions.find((session) => session.id === snapshot.activeSessionId) ?? null,
    [snapshot.sessions, snapshot.activeSessionId],
  )

  const spawnSession = useCallback(
    (cwd?: string, extraArgs?: string[]) => sessionStore.spawnSession(cwd, extraArgs),
    [],
  )
  const closeSession = useCallback((id?: string) => sessionStore.closeSession(id), [])
  const selectSession = useCallback((id: string) => sessionStore.selectSession(id), [])
  const refreshSessions = useCallback(() => sessionStore.refreshSessions(), [])

  return {
    sessions: snapshot.sessions,
    activeSessionId: snapshot.activeSessionId,
    activeSession,
    ready: snapshot.ready,
    error: snapshot.error,
    spawnSession,
    closeSession,
    selectSession,
    refreshSessions,
  }
}
