import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { ToolCallBlock, ToolResultBlock } from '@/types/transcript'
import type { DockTab } from '@/types/layout'
import { CheckCircle, XCircle, Loader2, Terminal, FileCode, Settings, Zap } from 'lucide-react'
import { useLayoutState } from '@/hooks/useLayoutState'
import { BashCard } from './tools/BashCard'
import { FileCard } from './tools/FileCard'
import { GenericCard } from './tools/GenericCard'

export type ToolStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface ToolBodyProps {
  block: ToolCallBlock | ToolResultBlock
  args: Record<string, unknown>
  isError: boolean
  openDockTab: (tab: DockTab) => void
}

export interface ToolRenderer {
  summarize: (args: Record<string, unknown>) => string
  Body: (props: ToolBodyProps) => JSX.Element
}

function summarizeBashArgs(args: Record<string, unknown>): string {
  const command = args.command
  return typeof command === 'string' ? command : ''
}

function summarizeFileArgs(args: Record<string, unknown>): string {
  const value = args.file_path ?? args.filePath ?? args.path ?? args.file
  return typeof value === 'string' ? value : ''
}

function summarizeGenericArgs(args: Record<string, unknown>): string {
  return JSON.stringify(args)
}

export const ToolRendererMap: Record<string, ToolRenderer> = {
  bash: { summarize: summarizeBashArgs, Body: BashCard },
  read: { summarize: summarizeFileArgs, Body: FileCard },
  write: { summarize: summarizeFileArgs, Body: FileCard },
  edit: { summarize: summarizeFileArgs, Body: FileCard },
}

const GENERIC_RENDERER: ToolRenderer = { summarize: summarizeGenericArgs, Body: GenericCard }

const STATUS_LABEL: Record<ToolStatus, string> = {
  pending: 'tool.statusRunning',
  running: 'tool.statusRunning',
  completed: 'tool.statusDone',
  failed: 'tool.statusFailed',
}

function getToolIcon(toolName: string) {
  switch (toolName) {
    case 'read':
    case 'write':
    case 'edit':
    case 'glob':
    case 'grep':
      return <FileCode size={14} className="text-[var(--accent)]" />
    case 'bash':
      return <Terminal size={14} className="text-[var(--accent)]" />
    case 'task':
    case 'todo':
      return <Settings size={14} className="text-[var(--accent)]" />
    case 'webfetch':
    case 'websearch':
      return <Zap size={14} className="text-[var(--accent)]" />
    default:
      return <Settings size={14} className="text-[var(--accent)]" />
  }
}

interface ToolCardProps {
  block: ToolCallBlock | ToolResultBlock
  pending?: ToolCallBlock | null
}

export function ToolCard({ block, pending }: ToolCardProps) {
  const { t } = useTranslation()
  const { state, toggleDock, setDockTab } = useLayoutState()
  const [expanded, setExpanded] = useState(false)

  const toolName = block.toolName
  const args = block.type === 'tool-call' ? block.args : (pending?.args ?? {})
  const status =
    pending?.status ?? (block.type === 'tool-call' ? block.status : block.isError ? 'failed' : 'completed')
  const isError = block.type === 'tool-result' ? block.isError : status === 'failed'
  const isPending = status === 'pending' || status === 'running'
  const renderer = ToolRendererMap[toolName] ?? GENERIC_RENDERER
  const summary = renderer.summarize(args)

  // Ensure-open semantics: clicking a body link must never flip an open dock shut.
  const openDockTab = (tab: DockTab) => {
    setDockTab(tab)
    if (state.dockCollapsed) {
      toggleDock()
    }
  }

  const statusIcon = isPending ? (
    <Loader2 size={14} className="text-[var(--accent)] animate-spin" />
  ) : isError ? (
    <XCircle size={14} className="text-red-500" />
  ) : (
    <CheckCircle size={14} className="text-green-500" />
  )

  return (
    <div className="w-full px-4 py-2">
      <div className={cn('rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden')}>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className={cn('flex w-full items-center gap-2 px-3 py-2 text-left', isError && 'bg-red-500/10')}
        >
          {getToolIcon(toolName)}
          <span className="font-mono text-sm font-medium text-[var(--fg-primary)]">{toolName}</span>
          <span className="flex-1 truncate text-xs text-[var(--fg-muted)]">{summary}</span>
          {statusIcon}
          <span
            className={cn('text-xs font-medium px-2 py-0.5 rounded', isPending && 'bg-[var(--accent-muted)] text-[var(--accent)]')}
          >
            {t(STATUS_LABEL[status])}
          </span>
        </button>

        {expanded && <renderer.Body block={block} args={args} isError={isError} openDockTab={openDockTab} />}
      </div>
    </div>
  )
}
