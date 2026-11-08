export type RailView = 'sessions' | 'worktrees' | 'agents' | 'tools' | 'settings' | 'help' | 'debug'

export type DockTab = 'preview' | 'terminal' | 'diff' | 'worktree' | 'editor'

export interface LayoutState {
  railView: RailView
  sidebarCollapsed: boolean
  dockCollapsed: boolean
  dockTab: DockTab
  dockWidth: number
  sidebarWidth: number
}

export interface PaneSizes {
  rail: number
  sidebar: number
  workspace: number
  dock: number
}

export const DEFAULT_LAYOUT_STATE: LayoutState = {
  railView: 'sessions',
  sidebarCollapsed: false,
  dockCollapsed: false,
  dockTab: 'preview',
  dockWidth: 360,
  sidebarWidth: 240,
}

export const RAIL_WIDTH = 48
export const SIDEBAR_WIDTH = 240
export const SIDEBAR_COLLAPSED_WIDTH = 48
export const DOCK_WIDTH = 360
export const DOCK_MIN_WIDTH = 280
export const DOCK_MAX_WIDTH = 640