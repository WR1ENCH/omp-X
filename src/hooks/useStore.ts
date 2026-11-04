import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { LayoutState, DEFAULT_LAYOUT_STATE } from '@/types/layout'

const STORE_KEY = 'layout.json'

export function useStore() {
  const [ready, setReady] = useState(false)
  const loadingRef = useRef(false)

  const load = useCallback(async (): Promise<LayoutState> => {
    if (loadingRef.current) return DEFAULT_LAYOUT_STATE
    loadingRef.current = true
    try {
      const stored = await invoke<string>('plugin:store|get', { key: STORE_KEY })
      if (stored) {
        const parsed = JSON.parse(stored)
        return { ...DEFAULT_LAYOUT_STATE, ...parsed }
      }
      return DEFAULT_LAYOUT_STATE
    } catch {
      return DEFAULT_LAYOUT_STATE
    } finally {
      loadingRef.current = false
      setReady(true)
    }
  }, [])

  const save = useCallback(async (state: LayoutState): Promise<void> => {
    try {
      await invoke('plugin:store|set', { key: STORE_KEY, value: JSON.stringify(state) })
      await invoke('plugin:store|save')
    } catch (e) {
      console.error('Failed to save layout state:', e)
    }
  }, [])

  useEffect(() => {
    load().then(() => setReady(true))
  }, [load])

  return { load, save, ready }
}