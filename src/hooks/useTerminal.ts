import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useTranslation } from 'react-i18next'
import { isTauri } from '@/lib/tauri'
import type { TerminalState } from '@/types/dock'
import type { PtyEvent, PtyReadResult, PtySpawnResult } from '@/types/ipc'

/** Single channel the backend pushes every PtyEvent onto (CONTRACT §3.2). */
export const PTY_EVENT_CHANNEL = 'omp://pty'

/** Fallback cadence for `pty_read` while a PTY is connected. */
const POLL_INTERVAL_MS = 250

/** Default PTY geometry used before xterm measures its container. */
const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

/**
 * The xterm side of the binding. `dispose` must release the xterm instance and
 * leave the caller's own reference untouched; the hook only uses it to satisfy
 * the "dispose on unmount / on exit" part of the contract.
 */
export interface XtermBinding {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  dispose: () => void
  /** Register a user-input handler; returns an unsubscribe function. */
  onData: (handler: (data: string) => void) => () => void
}

export interface UseTerminalOptions {
  /** Working directory for the spawned shell. Omitted -> backend default. */
  cwd?: string
  /** Shell executable. `null`/`undefined` -> platform default. */
  shell?: string | null
  cols?: number
  rows?: number
}

export interface TerminalController extends TerminalState {
  /** True while `pty_spawn` is in flight. */
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  /** Send user input to the PTY. No-op while disconnected. */
  write: (data: string) => void
  /** Resize the PTY (and the attached xterm). */
  resize: (cols: number, rows: number) => void
  /** Attach an xterm instance. Returns a detach function. */
  attachXterm: (binding: XtermBinding) => () => void
}

/** Platform default shell; `null` lets the backend pick its own default. */
function defaultShell(): string | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'powershell.exe'
  if (ua.includes('mac')) return '/bin/zsh'
  if (ua.includes('linux') || ua.includes('bsd')) return '/bin/bash'
  return null
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

/**
 * PTY lifecycle for the dock terminal tab.
 *
 * Contract (docs/m2/CONTRACT.md §2/§3.2/§5.7/§6.3):
 * - `pty_spawn` takes the flat `{ shell, cwd, cols, rows }` payload.
 * - All output/exit events arrive on the single `omp://pty` channel and are
 *   dispatched by `pid`. The backend never emits per-pid channels; do not
 *   listen for them.
 * - `pty_read` is only a 250ms fallback in case an event is lost.
 * - Unmount kills the PTY, disposes xterm and unsubscribes.
 */
export function useTerminal(options: UseTerminalOptions = {}): TerminalController {
  const { t } = useTranslation()

  const [state, setState] = useState<TerminalState>({
    connected: false,
    cols: options.cols ?? DEFAULT_COLS,
    rows: options.rows ?? DEFAULT_ROWS,
    pid: null,
    error: null,
  })
  const [connecting, setConnecting] = useState(false)

  const bindingRef = useRef<XtermBinding | null>(null)
  const pidRef = useRef<number | null>(null)
  /** Bumped on every teardown so in-flight spawns/polls can be invalidated. */
  const generationRef = useRef(0)
  const unlistenRef = useRef<UnlistenFn | null>(null)
  const colsRef = useRef(options.cols ?? DEFAULT_COLS)
  const rowsRef = useRef(options.rows ?? DEFAULT_ROWS)
  const optionsRef = useRef(options)
  const tRef = useRef(t)

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  useEffect(() => {
    tRef.current = t
  }, [t])

  const write = useCallback((data: string) => {
    const pid = pidRef.current
    if (pid == null) return
    invoke('pty_write', { pid, data }).catch((err) => {
      console.error('[terminal] pty_write failed', err)
    })
  }, [])

  const attachXterm = useCallback(
    (binding: XtermBinding) => {
      bindingRef.current = binding
      const offInput = binding.onData((data) => write(data))
      return () => {
        offInput()
        if (bindingRef.current === binding) bindingRef.current = null
      }
    },
    [write]
  )

  const disconnect = useCallback(async () => {
    generationRef.current += 1
    const pid = pidRef.current
    pidRef.current = null

    const binding = bindingRef.current
    bindingRef.current = null
    if (binding) {
      try {
        binding.dispose()
      } catch (err) {
        console.error('[terminal] xterm dispose failed', err)
      }
    }

    if (pid != null && isTauri()) {
      try {
        await invoke('pty_kill', { pid })
      } catch (err) {
        console.error('[terminal] pty_kill failed', err)
      }
    }

    setState((s) => ({ ...s, connected: false, pid: null }))
    setConnecting(false)
  }, [])

  const connect = useCallback(async () => {
    if (!isTauri()) {
      setConnecting(false)
      setState((s) => ({
        ...s,
        connected: false,
        pid: null,
        error: tRef.current('dock.terminal_group.tauriOnly'),
      }))
      return
    }

    // Invalidate anything still in flight from a previous connection.
    generationRef.current += 1
    const previousPid = pidRef.current
    pidRef.current = null
    if (previousPid != null) {
      invoke('pty_kill', { pid: previousPid }).catch((err) => {
        console.error('[terminal] pty_kill failed', err)
      })
    }
    const generation = generationRef.current

    setConnecting(true)
    setState((s) => ({ ...s, connected: false, pid: null, error: null }))

    try {
      const shell = optionsRef.current.shell ?? defaultShell()
      const result = await invoke<PtySpawnResult>('pty_spawn', {
        shell,
        cwd: optionsRef.current.cwd ?? null,
        cols: colsRef.current,
        rows: rowsRef.current,
      })

      // The component unmounted (or reconnected) while the spawn was pending.
      if (generation !== generationRef.current) {
        invoke('pty_kill', { pid: result.pid }).catch((err) => {
          console.error('[terminal] orphan pty_kill failed', err)
        })
        return
      }

      pidRef.current = result.pid
      setConnecting(false)
      setState({
        connected: true,
        cols: colsRef.current,
        rows: rowsRef.current,
        pid: result.pid,
        error: null,
      })
    } catch (err) {
      console.error('[terminal] pty_spawn failed', err)
      setConnecting(false)
      if (generation === generationRef.current) {
        setState((s) => ({ ...s, connected: false, pid: null, error: toMessage(err) }))
      }
    }
  }, [])

  const resize = useCallback((cols: number, rows: number) => {
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) return
    colsRef.current = Math.floor(cols)
    rowsRef.current = Math.floor(rows)
    bindingRef.current?.resize(colsRef.current, rowsRef.current)

    const pid = pidRef.current
    if (pid != null && isTauri()) {
      invoke('pty_resize', { pid, cols: colsRef.current, rows: rowsRef.current }).catch((err) => {
        console.error('[terminal] pty_resize failed', err)
      })
    }

    setState((s) =>
      s.cols === colsRef.current && s.rows === rowsRef.current
        ? s
        : { ...s, cols: colsRef.current, rows: rowsRef.current }
    )
  }, [])

  // Single subscription for the whole hook lifetime; events are filtered by pid.
  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    let localUnlisten: UnlistenFn | null = null

    listen<PtyEvent>(PTY_EVENT_CHANNEL, (event) => {
      const payload = event.payload
      if (payload.pid !== pidRef.current) return
      if (payload.type === 'data') {
        if (payload.data) bindingRef.current?.write(payload.data)
        return
      }
      if (payload.type === 'exit') {
        void disconnect()
      }
    })
      .then((unlisten) => {
        if (cancelled) {
          unlisten()
          return
        }
        localUnlisten = unlisten
        unlistenRef.current = unlisten
      })
      .catch((err) => {
        console.error('[terminal] omp://pty listen failed', err)
      })

    return () => {
      cancelled = true
      localUnlisten?.()
      if (unlistenRef.current === localUnlisten) unlistenRef.current = null
    }
  }, [disconnect])

  // 250ms `pty_read` fallback. The backend drains its buffer on read, so this
  // only surfaces bytes that no Data event delivered.
  const connected = state.connected && state.pid != null
  useEffect(() => {
    if (!connected || !isTauri()) return
    let inFlight = false

    const tick = async () => {
      if (inFlight) return
      const pid = pidRef.current
      if (pid == null) return
      inFlight = true
      try {
        const result = await invoke<PtyReadResult>('pty_read', { pid })
        if (pidRef.current !== pid) return
        if (result.data) bindingRef.current?.write(result.data)
        if (result.exited) await disconnect()
      } catch (err) {
        console.error('[terminal] pty_read failed', err)
      } finally {
        inFlight = false
      }
    }

    const timer = setInterval(() => {
      void tick()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [connected, disconnect])

  // Kill the PTY, dispose xterm and unsubscribe on unmount.
  useEffect(() => {
    return () => {
      generationRef.current += 1
      const pid = pidRef.current
      pidRef.current = null
      if (pid != null && isTauri()) {
        invoke('pty_kill', { pid }).catch((err) => {
          console.error('[terminal] pty_kill failed', err)
        })
      }
      try {
        bindingRef.current?.dispose()
      } catch (err) {
        console.error('[terminal] xterm dispose failed', err)
      }
      bindingRef.current = null
      unlistenRef.current?.()
      unlistenRef.current = null
    }
  }, [])

  // Auto-connect once. `connect` is stable, so a re-render does not respawn.
  useEffect(() => {
    void connect()
  }, [connect])

  return {
    connected: state.connected,
    rows: state.rows,
    cols: state.cols,
    pid: state.pid,
    error: state.error,
    connecting,
    connect,
    disconnect,
    write,
    resize,
    attachXterm,
  }
}
