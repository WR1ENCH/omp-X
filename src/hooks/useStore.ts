import { useCallback, useEffect, useRef, useState } from 'react'
import { storeGet, storeSave, storeSet } from '@/lib/store'
import { DEFAULT_LAYOUT_STATE, LayoutState } from '@/types/layout'

export const LAYOUT_STORE_PATH = 'layout.json'
export const LAYOUT_STORE_KEY = 'layout'

export interface LayoutStoreApi {
  /** Read the persisted layout state. Idempotent: concurrent calls share one read. */
  load: () => Promise<LayoutState>
  /** Persist the full layout snapshot. */
  save: (state: LayoutState) => Promise<void>
  /** Alias for `save`, used by the layout provider on every mutation. */
  persist: (state: LayoutState) => Promise<void>
  /** True once the initial read has settled. */
  ready: boolean
}

/**
 * Single persistence path for layout state.
 *
 * Every read/write goes through the tauri-plugin-store bridge in
 * `@/lib/store` (browser builds fall back to localStorage). The previous
 * implementation called `plugin:store|get` without a resource id and parsed
 * the tuple as the value, so nothing was ever persisted.
 */
export function useStore(): LayoutStoreApi {
  const [ready, setReady] = useState(false)
  const loadPromiseRef = useRef<Promise<LayoutState> | null>(null)

  const load = useCallback(async (): Promise<LayoutState> => {
    if (!loadPromiseRef.current) {
      loadPromiseRef.current = (async () => {
        try {
          const stored = await storeGet<Partial<LayoutState>>(LAYOUT_STORE_PATH, LAYOUT_STORE_KEY)
          return stored ? { ...DEFAULT_LAYOUT_STATE, ...stored } : DEFAULT_LAYOUT_STATE
        } catch (err) {
          console.error('[layout] failed to load persisted state:', err)
          return DEFAULT_LAYOUT_STATE
        }
      })()
    }
    return loadPromiseRef.current
  }, [])

  const save = useCallback(async (state: LayoutState): Promise<void> => {
    try {
      await storeSet(LAYOUT_STORE_PATH, LAYOUT_STORE_KEY, state)
      await storeSave(LAYOUT_STORE_PATH)
    } catch (err) {
      console.error('[layout] failed to persist state:', err)
    }
  }, [])

  const persist = useCallback(
    async (state: LayoutState): Promise<void> => {
      await save(state)
    },
    [save],
  )

  useEffect(() => {
    let active = true
    load().then(() => {
      if (active) setReady(true)
    })
    return () => {
      active = false
    }
  }, [load])

  return { load, save, persist, ready }
}
