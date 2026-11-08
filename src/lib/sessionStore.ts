import type { SessionInfo, SpawnSessionResult } from '@/types/ipc'
import { toSessionSummary, type SessionSummary } from '@/types/session'
import { invokeRequired } from '@/lib/tauri'

/**
 * Fallback working directory used when the UI auto-spawns a session without an
 * explicit cwd. `~` is resolved by the host to the user's home directory.
 */
export const DEFAULT_SESSION_CWD = '~'

export interface SessionStoreState {
  sessions: SessionSummary[]
  activeSessionId: string | null
  ready: boolean
  error: string | null
}

type Listener = () => void

let state: SessionStoreState = {
  sessions: [],
  activeSessionId: null,
  ready: false,
  error: null,
}

const listeners = new Set<Listener>()

function setState(patch: Partial<SessionStoreState>): void {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): SessionStoreState {
  return state
}

function toError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function upsertSession(info: SessionInfo): SessionSummary {
  const summary = toSessionSummary(info)
  const index = state.sessions.findIndex((session) => session.id === summary.id)
  const sessions =
    index >= 0
      ? state.sessions.map((session, i) => (i === index ? summary : session))
      : [...state.sessions, summary]
  setState({ sessions })
  return summary
}

function removeSession(sessionId: string): void {
  const sessions = state.sessions.filter((session) => session.id !== sessionId)
  const activeSessionId =
    state.activeSessionId === sessionId ? (sessions[0]?.id ?? null) : state.activeSessionId
  setState({ sessions, activeSessionId })
}

let hydrationPromise: Promise<void> | null = null

export const sessionStore = {
  subscribe,
  getSnapshot,
  getState: () => state,

  /** Replace the session list from the host. */
  async refreshSessions(): Promise<void> {
    try {
      const infos = await invokeRequired<SessionInfo[]>('list_sessions')
      const sessions = infos.map(toSessionSummary)
      const activeSessionId =
        state.activeSessionId && sessions.some((session) => session.id === state.activeSessionId)
          ? state.activeSessionId
          : (sessions[0]?.id ?? null)
      setState({ sessions, activeSessionId, ready: true, error: null })
    } catch (err) {
      setState({ ready: true, error: toError(err) })
      throw err
    }
  },

  /** Spawn a session on the host, track it and select it. */
  async spawnSession(cwd?: string, extraArgs?: string[]): Promise<string> {
    try {
      const result = await invokeRequired<SpawnSessionResult>('spawn_session', {
        cwd: cwd ?? DEFAULT_SESSION_CWD,
        extraArgs: extraArgs ?? [],
      })
      upsertSession({
        id: result.sessionId,
        cwd: result.cwd,
        alive: true,
        createdAt: Date.now(),
      })
      setState({ activeSessionId: result.sessionId, error: null })
      return result.sessionId
    } catch (err) {
      setState({ error: toError(err) })
      throw err
    }
  },

  /** Close a session on the host and drop it from the store. */
  async closeSession(id?: string): Promise<void> {
    const sessionId = id ?? state.activeSessionId
    if (!sessionId) return
    try {
      await invokeRequired<void>('close_session', { sessionId })
      removeSession(sessionId)
      setState({ error: null })
    } catch (err) {
      setState({ error: toError(err) })
      throw err
    }
  },

  selectSession(id: string): void {
    if (!state.sessions.some((session) => session.id === id)) return
    setState({ activeSessionId: id })
  },

  /**
   * Startup: list sessions, and when the host has none, spawn a default one so
   * the workspace always has an active session. Runs at most once per page.
   */
  hydrate(): Promise<void> {
    if (!hydrationPromise) {
      hydrationPromise = (async () => {
        try {
          await sessionStore.refreshSessions()
          if (sessionStore.getState().sessions.length === 0) {
            await sessionStore.spawnSession()
          }
        } catch {
          // refreshSessions/spawnSession already recorded the error in state.
        }
      })()
    }
    return hydrationPromise
  },
}

/** Test-only: reset the module-level store between test cases. */
export function __resetSessionStoreForTest(): void {
  state = { sessions: [], activeSessionId: null, ready: false, error: null }
  hydrationPromise = null
}

// The transcript provider owns the single Tauri event subscription, so a host
// that reaped a child tells us about it through this window event instead.
if (typeof window !== 'undefined') {
  window.addEventListener('omp:session-closed', (event) => {
    const detail = (event as CustomEvent<{ sessionId?: string }>).detail
    const sessionId = detail?.sessionId
    if (typeof sessionId === 'string' && sessionId) {
      removeSession(sessionId)
    }
  })
}
