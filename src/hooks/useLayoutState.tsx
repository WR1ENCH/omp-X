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
import { useStore } from './useStore'
import {
  DEFAULT_LAYOUT_STATE,
  DOCK_MAX_WIDTH,
  DOCK_MIN_WIDTH,
  RAIL_WIDTH,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_WIDTH,
  type DockTab,
  type LayoutState,
  type RailView,
} from '@/types/layout'

export interface LayoutStateApi {
  state: LayoutState
  ready: boolean
  railWidth: number
  sidebarWidth: number
  dockWidth: number
  setRailView: (railView: RailView) => void
  toggleSidebar: () => void
  toggleDock: () => void
  setDockTab: (dockTab: DockTab) => void
  setDockWidth: (width: number) => void
  setSidebarWidth: (width: number) => void
}

interface LayoutSnapshot {
  state: LayoutState
  hydrated: boolean
}

const LayoutStateContext = createContext<LayoutStateApi | null>(null)

/**
 * Single source of truth for the four-pane layout.
 *
 * The previous `useLayoutState` was a plain hook: every component that called
 * it got its own `useState` + its own `window.keydown` listener, and each
 * instance wrote the whole snapshot back to the store, so nothing was shared.
 * This version exposes one React context (mounted once in `main.tsx`) and one
 * persistence path (`useStore`). Shortcuts are registered separately by
 * `useShortcuts` at the app top level.
 */
export function LayoutStateProvider({ children }: { children: ReactNode }): JSX.Element {
  const { load, persist, ready: storeReady } = useStore()
  const [snapshot, setSnapshot] = useState<LayoutSnapshot>({
    state: DEFAULT_LAYOUT_STATE,
    hydrated: false,
  })
  const stateRef = useRef(snapshot.state)

  useEffect(() => {
    if (!storeReady || snapshot.hydrated) return
    let active = true
    load().then((loaded) => {
      if (!active) return
      stateRef.current = loaded
      setSnapshot({ state: loaded, hydrated: true })
    })
    return () => {
      active = false
    }
  }, [storeReady, snapshot.hydrated, load])

  const update = useCallback(
    (patch: Partial<LayoutState>) => {
      const next = { ...stateRef.current, ...patch }
      stateRef.current = next
      setSnapshot({ state: next, hydrated: true })
      void persist(next)
    },
    [persist],
  )

  const setRailView = useCallback((railView: RailView) => update({ railView }), [update])

  const toggleSidebar = useCallback(
    () => update({ sidebarCollapsed: !stateRef.current.sidebarCollapsed }),
    [update],
  )

  const toggleDock = useCallback(
    () => update({ dockCollapsed: !stateRef.current.dockCollapsed }),
    [update],
  )

  const setDockTab = useCallback((dockTab: DockTab) => update({ dockTab }), [update])

  const setDockWidth = useCallback(
    (width: number) => {
      const clamped = Math.max(DOCK_MIN_WIDTH, Math.min(DOCK_MAX_WIDTH, width))
      update({ dockWidth: clamped })
    },
    [update],
  )

  const setSidebarWidth = useCallback(
    (width: number) => {
      const clamped = Math.max(SIDEBAR_COLLAPSED_WIDTH, Math.min(SIDEBAR_WIDTH, width))
      update({ sidebarWidth: clamped })
    },
    [update],
  )

  const { state } = snapshot
  const railWidth = RAIL_WIDTH
  const sidebarWidth = state.sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : state.sidebarWidth
  const dockWidth = state.dockCollapsed ? 0 : state.dockWidth

  const value = useMemo<LayoutStateApi>(
    () => ({
      state,
      ready: storeReady && snapshot.hydrated,
      railWidth,
      sidebarWidth,
      dockWidth,
      setRailView,
      toggleSidebar,
      toggleDock,
      setDockTab,
      setDockWidth,
      setSidebarWidth,
    }),
    [
      state,
      storeReady,
      snapshot.hydrated,
      railWidth,
      sidebarWidth,
      dockWidth,
      setRailView,
      toggleSidebar,
      toggleDock,
      setDockTab,
      setDockWidth,
      setSidebarWidth,
    ],
  )

  return <LayoutStateContext.Provider value={value}>{children}</LayoutStateContext.Provider>
}

export function useLayoutState(): LayoutStateApi {
  const context = useContext(LayoutStateContext)
  if (!context) {
    throw new Error('useLayoutState must be used within a LayoutStateProvider')
  }
  return context
}
