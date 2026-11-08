import { PreviewTab } from './PreviewTab'
import { TerminalTab } from './TerminalTab'
import { DiffTab } from './DiffTab'
import { WorktreeTab } from './WorktreeTab'
import { EditorTab } from './EditorTab'
import type { EditorTabProps } from './EditorTab'
import { DockTab } from '@/types/layout'

export { PreviewTab } from './PreviewTab'
export { TerminalTab } from './TerminalTab'
export { DiffTab } from './DiffTab'
export { WorktreeTab } from './WorktreeTab'
export { EditorTab } from './EditorTab'

export type { DockTab } from '@/types/layout'
export type { EditorTabProps }

export const DOCK_TAB_COMPONENTS: Record<DockTab, React.ComponentType<EditorTabProps>> = {
  preview: PreviewTab,
  terminal: TerminalTab,
  diff: DiffTab,
  worktree: WorktreeTab,
  editor: EditorTab,
}

export const DOCK_TAB_META = {
  preview: { icon: 'Maximize2', labelKey: 'dock.preview' },
  terminal: { icon: 'Minimize2', labelKey: 'dock.terminal' },
  diff: { icon: 'GitCompare', labelKey: 'dock.diff' },
  worktree: { icon: 'FolderGit2', labelKey: 'dock.worktree' },
  editor: { icon: 'Edit3', labelKey: 'dock.editor' },
} as const satisfies Record<DockTab, { icon: string; labelKey: string }>

export function renderDockTab(tab: DockTab, props?: EditorTabProps): React.ReactNode {
  const Component = DOCK_TAB_COMPONENTS[tab]
  if (!Component) return null
  return <Component {...(props ?? {})} />
}
