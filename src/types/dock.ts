export interface PreviewState {
  url: string
  loading: boolean
  error: string | null
  canGoBack: boolean
  canGoForward: boolean
}

export interface TerminalState {
  connected: boolean
  rows: number
  cols: number
  pid: number | null
  error: string | null
}

export interface DiffHunk {
  id: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

export interface DiffLine {
  type: 'context' | 'add' | 'remove'
  content: string
  oldLineNumber: number | null
  newLineNumber: number | null
}

export interface DiffState {
  hunks: DiffHunk[]
  loading: boolean
  error: string | null
  filePath: string | null
  oldContent: string
  newContent: string
}

export interface WorktreeInfo {
  path: string
  branch: string
  commit: string
  bare: boolean
  detached: boolean
  locked: boolean
  prunable: boolean
}

export interface WorktreeState {
  worktrees: WorktreeInfo[]
  loading: boolean
  error: string | null
  creating: boolean
}

export interface DockTabComponents {
  preview: React.ReactNode
  terminal: React.ReactNode
  diff: React.ReactNode
  worktree: React.ReactNode
  editor: React.ReactNode
}

export type DockTabId = 'preview' | 'terminal' | 'diff' | 'worktree' | 'editor'