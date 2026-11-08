import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useTranslation } from 'react-i18next'
import type { PreviewState } from '@/types/dock'
import { isTauri } from '@/lib/tauri'

export const PREVIEW_WINDOW_LABEL = 'preview'
export const DEFAULT_PREVIEW_URL = 'https://example.com'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Normalizes a user-entered URL and rejects anything that is not http(s).
 * Returns `null` when the input cannot be turned into a safe remote URL.
 */
export function normalizePreviewUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Be forgiving about a missing scheme, but never about a dangerous one.
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const parsed = new URL(candidate)
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null
    return parsed.href
  } catch {
    return null
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return 'Unknown error'
  }
}

interface PreviewSurface {
  /** The live OS window, when one exists. Kept outside React so it survives a dock-tab switch. */
  win: WebviewWindow | null
  history: string[]
  index: number
  url: string | null
  windowOpen: boolean
  listeners: Set<(snapshot: PreviewSnapshot) => void>
}

interface PreviewSnapshot {
  url: string | null
  canGoBack: boolean
  canGoForward: boolean
  windowOpen: boolean
}

/**
 * Module-level preview surface. `WebviewWindow` is an OS window, so it must
 * outlive the React component that created it; otherwise switching dock tabs
 * would close the preview and lose its history.
 */
const surface: PreviewSurface = {
  win: null,
  history: [],
  index: -1,
  url: null,
  windowOpen: false,
  listeners: new Set(),
}

function snapshot(): PreviewSnapshot {
  return {
    url: surface.url,
    canGoBack: surface.index > 0,
    canGoForward: surface.index < surface.history.length - 1,
    windowOpen: surface.windowOpen,
  }
}

function emitSurface(): void {
  const current = snapshot()
  surface.listeners.forEach((listener) => listener(current))
}

function pushHistory(url: string): void {
  const next = surface.history.slice(0, surface.index + 1)
  next.push(url)
  surface.history = next
  surface.index = next.length - 1
  surface.url = url
}

/**
 * Creates the isolated preview window. Tauri v2 has no runtime navigation API
 * (`Webview` exposes no `setUrl`/`loadURL`/`navigate`), so navigating means
 * closing the current window and creating a fresh one. The URL is always
 * validated by the caller before it reaches here.
 */
async function openPreviewWindow(url: string): Promise<WebviewWindow> {
  if (surface.win) {
    try {
      await surface.win.close()
    } catch (err) {
      console.error('[preview] closing previous window failed', err)
    }
    surface.win = null
  }

  // Another instance may already own the label (e.g. the window was recreated
  // outside this module). `getByLabel` is best-effort.
  try {
    const existing = await WebviewWindow.getByLabel(PREVIEW_WINDOW_LABEL)
    if (existing && existing !== surface.win) {
      try {
        await existing.close()
      } catch (err) {
        console.error('[preview] closing stale window failed', err)
      }
    }
  } catch (err) {
    console.error('[preview] window lookup failed', err)
  }

  const win = new WebviewWindow(PREVIEW_WINDOW_LABEL, {
    url,
    title: 'Preview',
    width: 960,
    height: 680,
    minWidth: 480,
    minHeight: 320,
    center: true,
  })

  // The constructor reports success/failure through events rather than a promise.
  const failure = await new Promise<unknown | null>((resolve) => {
    let settled = false
    const settle = (value: unknown | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    win.once('tauri://created', () => settle(null))
    win.once('tauri://error', (err) => settle(err))
  })

  if (failure) throw new Error(errorMessage(failure))

  surface.win = win
  surface.windowOpen = true

  win.once('tauri://destroyed', () => {
    if (surface.win !== win) return
    surface.win = null
    surface.windowOpen = false
    emitSurface()
  })

  return win
}

async function closePreviewWindow(): Promise<void> {
  const win = surface.win
  surface.win = null
  surface.windowOpen = false
  if (!win) return
  try {
    await win.close()
  } catch (err) {
    console.error('[preview] close failed', err)
  }
}

export interface PreviewController extends PreviewState {
  isTauri: boolean
  /** False when the isolated Tauri window is closed (Tauri branch only). */
  windowOpen: boolean
  iframeRef: RefObject<HTMLIFrameElement>
  navigate: (url: string) => Promise<void>
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  reload: () => Promise<void>
  close: () => Promise<void>
}

export function usePreview(initialUrl: string = DEFAULT_PREVIEW_URL): PreviewController {
  const { t } = useTranslation()
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])

  const [url, setUrl] = useState(initialUrl)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [windowOpen, setWindowOpen] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const mountedRef = useRef(true)
  const startedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    const sync = (next: PreviewSnapshot) => {
      if (!mountedRef.current) return
      setUrl(next.url ?? initialUrl)
      setCanGoBack(next.canGoBack)
      setCanGoForward(next.canGoForward)
      setWindowOpen(next.windowOpen)
    }
    surface.listeners.add(sync)
    sync(snapshot())
    return () => {
      mountedRef.current = false
      surface.listeners.delete(sync)
    }
  }, [initialUrl])

  /** Loads `target` into whichever preview surface is active. */
  const load = useCallback(
    async (target: string): Promise<void> => {
      setLoading(true)
      try {
        if (isTauri()) {
          await openPreviewWindow(target)
          surface.windowOpen = true
        }
        setError(null)
      } catch (err) {
        console.error('[preview] navigate failed', err)
        setError(errorMessage(err))
      } finally {
        if (mountedRef.current) setLoading(false)
        emitSurface()
      }
    },
    []
  )

  const navigate = useCallback(
    async (target: string) => {
      const normalized = normalizePreviewUrl(target)
      if (!normalized) {
        setError(tRef.current('dock.preview_group.invalidUrl'))
        return
      }

      if (normalized !== surface.url) pushHistory(normalized)
      else surface.url = normalized

      setUrl(normalized)
      await load(normalized)
    },
    [load]
  )

  const goBack = useCallback(async () => {
    if (surface.index <= 0) return
    surface.index -= 1
    const target = surface.history[surface.index]
    surface.url = target
    setUrl(target)
    emitSurface()
    await load(target)
  }, [load])

  const goForward = useCallback(async () => {
    if (surface.index >= surface.history.length - 1) return
    surface.index += 1
    const target = surface.history[surface.index]
    surface.url = target
    setUrl(target)
    emitSurface()
    await load(target)
  }, [load])

  const reload = useCallback(async () => {
    const target = surface.url ?? url
    if (!target) return
    await load(target)
  }, [load, url])

  const close = useCallback(async () => {
    await closePreviewWindow()
    emitSurface()
  }, [])

  // Open the preview surface once on mount so the pane is usable immediately.
  // The initial open is deferred to a macrotask: `load` flips `loading` state,
  // and doing that synchronously inside the effect would cascade a render in
  // the same commit.
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    if (!isTauri()) {
      // Non-Tauri: the iframe below renders the initial URL.
      pushHistory(initialUrl)
      surface.url = initialUrl
      emitSurface()
      return
    }

    const initial = normalizePreviewUrl(initialUrl) ?? DEFAULT_PREVIEW_URL
    pushHistory(initial)
    surface.url = initial
    emitSurface()

    const timer = window.setTimeout(() => {
      load(initial).catch((err) => {
        console.error('[preview] initial open failed', err)
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [initialUrl, load])

  return {
    url,
    loading,
    error,
    canGoBack,
    canGoForward,
    isTauri: isTauri(),
    windowOpen,
    iframeRef,
    navigate,
    goBack,
    goForward,
    reload,
    close,
  }
}
