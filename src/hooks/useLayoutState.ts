import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from './useStore'
import { LayoutState, DEFAULT_LAYOUT_STATE, RAIL_WIDTH, SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, DOCK_MIN_WIDTH, DOCK_MAX_WIDTH } from '@/types/layout'

export function useLayoutState() {
  const { load, save, ready } = useStore()
  const [state, setState] = useState<LayoutState>(DEFAULT_LAYOUT_STATE)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (ready && !hydrated) {
      load().then((loaded) => {
        setState(loaded)
        setHydrated(true)
      })
    }
  }, [ready, load, hydrated])

  const persist = useCallback(
    (next: LayoutState) => {
      setState(next)
      save(next)
    },
    [save]
  )

  const setRailView = useCallback(
    (railView: LayoutState['railView']) => persist({ ...state, railView }),
    [persist, state]
  )

  const toggleSidebar = useCallback(() => {
    persist({ ...state, sidebarCollapsed: !state.sidebarCollapsed })
  }, [persist, state])

  const toggleDock = useCallback(() => {
    persist({ ...state, dockCollapsed: !state.dockCollapsed })
  }, [persist, state])

  const setDockTab = useCallback(
    (dockTab: LayoutState['dockTab']) => persist({ ...state, dockTab }),
    [persist, state]
  )

  const setDockWidth = useCallback(
    (width: number) => {
      const clamped = Math.max(DOCK_MIN_WIDTH, Math.min(DOCK_MAX_WIDTH, width))
      persist({ ...state, dockWidth: clamped })
    },
    [persist, state]
  )

  const setSidebarWidth = useCallback(
    (width: number) => {
      const clamped = Math.max(SIDEBAR_COLLAPSED_WIDTH, Math.min(SIDEBAR_WIDTH, width))
      persist({ ...state, sidebarWidth: clamped })
    },
    [persist, state]
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'b' || e.key === 'B') {
          e.preventDefault()
          toggleSidebar()
        } else if (e.key === '\\') {
          e.preventDefault()
          toggleDock()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar, toggleDock])

  const computed = useMemo(() => ({
    railWidth: RAIL_WIDTH,
    sidebarWidth: state.sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : state.sidebarWidth,
    dockWidth: state.dockCollapsed ? 0 : state.dockWidth,
    workspaceFlex: 1,
  }), [state.sidebarCollapsed, state.sidebarWidth, state.dockCollapsed, state.dockWidth])

  return {
    ...state,
    ...computed,
    ready: ready && hydrated,
    setRailView,
    toggleSidebar,
    toggleDock,
    setDockTab,
    setDockWidth,
    setSidebarWidth,
  }
}