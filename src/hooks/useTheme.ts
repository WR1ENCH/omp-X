import { useCallback, useEffect, useRef, useState } from 'react'
import { storeGet, storeSave, storeSet } from '@/lib/store'
import { DEFAULT_THEME_STATE, type ThemeMode, type ThemeState } from '@/types/theme'

export const THEME_STORE_PATH = 'theme.json'
export const THEME_STORE_KEY = 'theme'

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? 'dark' : 'light'
}

function applyTheme(resolved: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = resolved
}

/**
 * Theme state with a single persistence path through the store bridge.
 *
 * The previous implementation called `plugin:store|get` without a resource id
 * and swallowed the failure, so the chosen theme was never restored.
 */
export function useTheme() {
  const [state, setState] = useState<ThemeState>(DEFAULT_THEME_STATE)
  const [ready, setReady] = useState(false)
  const loadPromiseRef = useRef<Promise<ThemeState> | null>(null)

  const load = useCallback(async (): Promise<ThemeState> => {
    if (!loadPromiseRef.current) {
      loadPromiseRef.current = (async () => {
        try {
          const stored = await storeGet<Partial<ThemeState>>(THEME_STORE_PATH, THEME_STORE_KEY)
          if (stored?.mode) {
            const mode = stored.mode as ThemeMode
            return { mode, resolved: mode === 'system' ? getSystemTheme() : mode }
          }
        } catch (err) {
          console.error('[theme] failed to load persisted state:', err)
        }
        return { mode: 'system' as const, resolved: getSystemTheme() }
      })()
    }
    return loadPromiseRef.current
  }, [])

  const save = useCallback(async (mode: ThemeMode): Promise<void> => {
    try {
      await storeSet(THEME_STORE_PATH, THEME_STORE_KEY, { mode })
      await storeSave(THEME_STORE_PATH)
    } catch (err) {
      console.error('[theme] failed to persist state:', err)
    }
  }, [])

  const setTheme = useCallback(
    async (mode: ThemeMode) => {
      const resolved = mode === 'system' ? getSystemTheme() : mode
      setState({ mode, resolved })
      applyTheme(resolved)
      await save(mode)
    },
    [save],
  )

  useEffect(() => {
    let active = true
    load().then((loaded) => {
      if (!active) return
      setState(loaded)
      applyTheme(loaded.resolved)
      setReady(true)
    })
    return () => {
      active = false
    }
  }, [load])

  useEffect(() => {
    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
    const handleChange = (event: MediaQueryListEvent) => {
      if (state.mode !== 'system') return
      const resolved = event.matches ? 'dark' : 'light'
      setState((prev) => ({ ...prev, resolved }))
      applyTheme(resolved)
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [state.mode])

  return { ...state, ready, setTheme }
}
