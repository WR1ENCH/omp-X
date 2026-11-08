import { cn } from '@/lib/utils'
import { ToolCallBlock, ToolResultBlock } from '@/types/transcript'
import { CheckCircle, XCircle, Loader2, Terminal, FileCode, Settings, Zap } from 'lucide-react'

interface ToolCardProps {
  block: ToolCallBlock | ToolResultBlock
  pending?: ToolCallBlock | null
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

function formatArgs(args: Record<string, unknown>) {
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
}

function formatResult(result: unknown, isError: boolean) {
  if (isError) {
    return String(result)
  }
  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return String(result)
  }
}

export function ToolCard({ block, pending }: ToolCardProps) {
  const toolName = block.toolName
  const args = block.type === 'tool-call' ? block.args : {}
  const status =
    pending?.status ?? (block.type === 'tool-call' ? block.status : block.isError ? 'failed' : 'completed')
  const isError = block.type === 'tool-result' ? block.isError : status === 'failed'
  const isPending = status === 'pending' || status === 'running'

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
        <div className={cn('flex items-center gap-2 px-3 py-2', isError && 'bg-red-500/10 border-b border-red-500/20')}>
          {getToolIcon(toolName)}
          <span className="font-mono text-sm font-medium text-[var(--fg-primary)]">{toolName}</span>
          <span className="flex-1" />
          {statusIcon}
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded', isPending && 'bg-[var(--accent-muted)] text-[var(--accent)]')}>
            {isPending ? 'Running' : isError ? 'Failed' : 'Done'}
          </span>
        </div>

        <details className="group">
          <summary className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--fg-muted)] cursor-pointer hover:bg-[var(--bg-hover)]">
            <span>Arguments</span>
          </summary>
          <pre className="px-3 pb-2 text-xs bg-[var(--bg-base)] overflow-x-auto">
            <code className="text-[var(--fg-secondary)]">{formatArgs(args)}</code>
          </pre>
        </details>

        {block.result !== undefined && (
          <details className="group">
            <summary className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--fg-muted)] cursor-pointer hover:bg-[var(--bg-hover)]">
              <span>{isError ? 'Error' : 'Result'}</span>
            </summary>
            <pre className={cn('px-3 pb-2 text-xs bg-[var(--bg-base)] overflow-x-auto', isError && 'text-red-500')}>
              <code>{formatResult(block.result, isError)}</code>
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
