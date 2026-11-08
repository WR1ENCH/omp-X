import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invokeRequired, isTauri } from '@/lib/tauri'
import type { FrontendEvent } from '@/types/ipc'
import type { ApprovalRequest, StatusItem, Toast, WidgetItem } from '@/types/approval'

/** Requests that are not answered within this window are auto-cancelled. */
export const APPROVAL_TIMEOUT_MS = 120_000

const DEFAULT_TOAST_DURATION_MS = 5000

/** Only these methods block on a user decision. */
const PENDING_METHODS: ReadonlySet<string> = new Set(['select', 'confirm', 'input', 'editor'])

/** Method aliases tolerate `set_status` / `setStatus` / `SET-STATUS`. */
const METHOD_ALIASES: Record<string, ApprovalRequest['method']> = {
  notify: 'notify',
  setstatus: 'setStatus',
  setwidget: 'setWidget',
  settitle: 'setTitle',
  select: 'select',
  confirm: 'confirm',
  input: 'input',
  editor: 'editor',
}

export interface ApprovalApi {
  /** Decision-blocking requests only; notification methods never land here. */
  pendingRequests: Map<string, ApprovalRequest>
  toasts: Toast[]
  statusItems: StatusItem[]
  widgetItems: WidgetItem[]
  titleItem: string | null
  respond: (id: string, value: unknown, cancelled?: boolean) => Promise<void>
  dismissToast: (id: string) => void
}

const ApprovalContext = createContext<ApprovalApi | null>(null)

interface NormalizedEvent {
  sessionId: string | null
  event: FrontendEvent
}

function readString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string') return value
  }
  return undefined
}

/**
 * Accept either the documented `SessionEnvelope` (`{ sessionId, event }`) or a
 * bare `FrontendEvent`, and tolerate snake_case field names on the inner event.
 * The `{ id, request: {...} }` shape emitted by `useTranscript` on the window is
 * accepted too, so the browser-preview fallback keeps working. A payload
 * without a session id is accepted so the single-session UI keeps working with
 * hosts that do not wrap events yet.
 */
function normalizeEvent(raw: unknown): NormalizedEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const envelope = raw as Record<string, unknown>
  const inner = (
    envelope.event && typeof envelope.event === 'object' ? envelope.event : envelope
  ) as Record<string, unknown>

  const nestedRequest =
    inner.request && typeof inner.request === 'object'
      ? (inner.request as Record<string, unknown>)
      : null
  const source = nestedRequest ?? inner

  const type = readString(source, 'type', 'kind') ?? (nestedRequest ? 'ui_request' : undefined)
  if (!type) return null

  const event = {
    ...(source as unknown as FrontendEvent),
    type,
    // The window bridge puts the id next to `request`, the host puts it on the
    // event itself; accept either position.
    id: readString(inner, 'id', 'requestId', 'request_id') ?? readString(source, 'id', 'requestId', 'request_id'),
    method: readString(source, 'method', 'requestMethod', 'request_method'),
    title: readString(source, 'title'),
    options: Array.isArray(source.options)
      ? (source.options as unknown[]).filter((o): o is string => typeof o === 'string')
      : undefined,
    extra:
      source.extra && typeof source.extra === 'object'
        ? (source.extra as Record<string, unknown>)
        : {},
  } as FrontendEvent

  const sessionId = readString(envelope, 'sessionId', 'session_id')

  return { sessionId: sessionId ?? null, event }
}

function normalizeMethod(method: string | undefined): ApprovalRequest['method'] | null {
  if (!method) return null
  return METHOD_ALIASES[method.toLowerCase().replace(/[_\-\s]/g, '')] ?? null
}

function toToastType(value: unknown): Toast['type'] {
  return value === 'warning' || value === 'error' ? value : 'info'
}

export function ApprovalProvider({ sessionId, children }: { sessionId: string | null; children: ReactNode }) {
  const [pendingRequests, setPendingRequests] = useState<Map<string, ApprovalRequest>>(new Map())
  const [toasts, setToasts] = useState<Toast[]>([])
  const [statusItems, setStatusItems] = useState<StatusItem[]>([])
  const [widgetItems, setWidgetItems] = useState<WidgetItem[]>([])
  const [titleItem, setTitleItem] = useState<string | null>(null)

  const requestSessionRef = useRef(new Map<string, string>())
  const seenIdsRef = useRef(new Set<string>())
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const toastTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const toastSeqRef = useRef(0)

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      toastTimersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const addToast = useCallback(
    (type: Toast['type'], message: string, duration?: number) => {
      toastSeqRef.current += 1
      const id = `toast-${toastSeqRef.current}`
      const ttl = duration ?? DEFAULT_TOAST_DURATION_MS
      setToasts((prev) => [...prev, { id, type, message, duration: ttl, timestamp: Date.now() }])
      if (ttl > 0) {
        toastTimersRef.current.set(
          id,
          setTimeout(() => dismissToast(id), ttl),
        )
      }
    },
    [dismissToast],
  )

  const clearRequestTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const respond = useCallback(
    async (id: string, value: unknown, cancelled = false): Promise<void> => {
      const request = pendingRequests.get(id)
      if (!request) return
      const targetSession = requestSessionRef.current.get(id) ?? sessionId
      if (!targetSession) return

      const response = cancelled ? { cancelled: true } : value
      try {
        await invokeRequired('send_ui_response', { sessionId: targetSession, requestId: id, response })
      } catch (err) {
        // Keep the request pending: the host never received an answer.
        console.error('[approval] send_ui_response failed', err)
        return
      }

      clearRequestTimer(id)
      requestSessionRef.current.delete(id)
      setPendingRequests((prev) => {
        if (!prev.has(id)) return prev
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    },
    [clearRequestTimer, pendingRequests, sessionId],
  )

  // The timeout callback must always see the newest `respond` (and therefore the
  // newest pending map), otherwise it would fire against a stale snapshot.
  const respondRef = useRef(respond)
  useEffect(() => {
    respondRef.current = respond
  }, [respond])

  const scheduleTimeout = useCallback(
    (id: string) => {
      clearRequestTimer(id)
      timersRef.current.set(
        id,
        setTimeout(() => {
          timersRef.current.delete(id)
          void respondRef.current(id, null, true)
        }, APPROVAL_TIMEOUT_MS),
      )
    },
    [clearRequestTimer],
  )

  const handleEvent = useCallback(
    (raw: unknown) => {
      const normalized = normalizeEvent(raw)
      if (!normalized) return
      const { sessionId: eventSessionId, event } = normalized
      if (event.type !== 'ui_request') return
      const currentSession = sessionId
      if (eventSessionId && currentSession && eventSessionId !== currentSession) return

      const method = normalizeMethod(event.method)
      const requestId = event.id
      if (!method || !requestId) return

      if (method === 'notify') {
        addToast(toToastType(event.extra?.type), event.title ?? (event.extra?.message as string) ?? '')
        return
      }
      if (method === 'setStatus') {
        const key = (event.extra?.key as string) ?? requestId
        const text = event.title ?? (event.extra?.text as string) ?? ''
        setStatusItems((prev) => {
          const index = prev.findIndex((item) => item.key === key)
          const nextItem: StatusItem = { key, text, timestamp: Date.now() }
          return index >= 0
            ? prev.map((item, i) => (i === index ? nextItem : item))
            : [...prev, nextItem]
        })
        return
      }
      if (method === 'setWidget') {
        const widgetKey =
          (event.extra?.widgetKey as string) ?? (event.extra?.widget_key as string) ?? requestId
        const rawLines = event.extra?.lines
        const lines = Array.isArray(rawLines) ? rawLines.map((line) => String(line)) : []
        setWidgetItems((prev) => {
          const index = prev.findIndex((item) => item.widgetKey === widgetKey)
          const nextItem: WidgetItem = { widgetKey, lines, timestamp: Date.now() }
          return index >= 0
            ? prev.map((item, i) => (i === index ? nextItem : item))
            : [...prev, nextItem]
        })
        return
      }
      if (method === 'setTitle') {
        setTitleItem(event.title ?? null)
        return
      }
      if (!PENDING_METHODS.has(method)) return
      if (seenIdsRef.current.has(requestId)) return
      seenIdsRef.current.add(requestId)

      const request: ApprovalRequest = {
        id: requestId,
        method,
        title: event.title,
        options: event.options,
        extra: event.extra ?? {},
        timestamp: Date.now(),
      }
      if (currentSession) requestSessionRef.current.set(requestId, currentSession)
      setPendingRequests((prev) => {
        if (prev.has(requestId)) return prev
        const next = new Map(prev)
        next.set(requestId, request)
        return next
      })
      if (method !== 'editor') scheduleTimeout(requestId)
    },
    [addToast, scheduleTimeout, sessionId],
  )

  useEffect(() => {
    let active = true
    let unlisten: UnlistenFn | null = null
    let removeWindowListener: (() => void) | null = null

    if (isTauri()) {
      listen<unknown>('omp://event', (payload) => {
        if (active) handleEvent(payload.payload)
      })
        .then((fn) => {
          if (active) unlisten = fn
          else fn()
        })
        .catch((err) => console.error('[approval] failed to subscribe to omp://event', err))
    } else {
      // Browser preview: the transcript layer re-dispatches ui_request as a
      // window event. Kept as a fallback so the approval UI still works there.
      const onWindowEvent = (e: Event) => {
        if (active) handleEvent((e as CustomEvent).detail)
      }
      window.addEventListener('omp:ui-request', onWindowEvent)
      removeWindowListener = () => window.removeEventListener('omp:ui-request', onWindowEvent)
    }

    return () => {
      active = false
      unlisten?.()
      removeWindowListener?.()
    }
  }, [handleEvent])

  // Drop state that belongs to a previous session.
  const [previousSessionId, setPreviousSessionId] = useState(sessionId)
  if (sessionId !== previousSessionId) {
    setPreviousSessionId(sessionId)
    setPendingRequests(new Map())
    setToasts([])
    setStatusItems([])
    setWidgetItems([])
    setTitleItem(null)
  }

  useEffect(() => {
    seenIdsRef.current.clear()
    requestSessionRef.current.clear()
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current.clear()
  }, [sessionId])

  useEffect(() => {
    const timers = timersRef.current
    const toastTimers = toastTimersRef.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
      toastTimers.forEach((timer) => clearTimeout(timer))
      toastTimers.clear()
    }
  }, [])

  const value = useMemo<ApprovalApi>(
    () => ({
      pendingRequests,
      toasts,
      statusItems,
      widgetItems,
      titleItem,
      respond,
      dismissToast,
    }),
    [pendingRequests, toasts, statusItems, widgetItems, titleItem, respond, dismissToast],
  )

  return <ApprovalContext.Provider value={value}>{children}</ApprovalContext.Provider>
}

export function useApproval(): ApprovalApi {
  const context = useContext(ApprovalContext)
  if (!context) {
    throw new Error('useApproval must be used within an ApprovalProvider')
  }
  return context
}
