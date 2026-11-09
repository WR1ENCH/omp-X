import { cn } from '@/lib/utils'
import { Block, SystemBlock } from '@/types/transcript'
import {
  PlayCircle,
  Square,
  AlertCircle,
  Info,
  Bot,
  Zap,
} from 'lucide-react'

function getEventIcon(event: SystemBlock['event']) {
  switch (event) {
    case 'session_start':
      return <PlayCircle size={10} />
    case 'session_end':
      return <Square size={10} />
    case 'agent_start':
      return <Bot size={10} />
    case 'turn_start':
      return <Zap size={10} />
    case 'turn_end':
      return <Square size={10} />
    case 'error':
      return <AlertCircle size={10} />
    case 'info':
      return <Info size={10} />
  }
}

const EVENT_LABELS: Record<SystemBlock['event'], string> = {
  session_start: 'Session started',
  session_end: 'Session ended',
  agent_start: 'Agent started',
  turn_start: 'Turn started',
  turn_end: 'Turn ended',
  error: 'Error',
  info: 'Info',
}

interface SystemEventLineProps {
  block: Block
}

export function SystemEventLine({ block }: SystemEventLineProps) {
  const systemBlock = block as SystemBlock
  const label = EVENT_LABELS[systemBlock.event]

  return (
    <div className="w-full px-4 py-1">
      <div
        className={cn(
          'flex items-center justify-center gap-2 px-3 py-1.5 rounded-full text-xs',
          'bg-[var(--bg-elevated)] border border-[var(--border)]',
          'text-[var(--fg-muted)]',
          'max-w-fit mx-auto'
        )}
      >
        {getEventIcon(systemBlock.event)}
        <span>{label}</span>
        {systemBlock.message && <span className="font-mono">{systemBlock.message}</span>}
      </div>
    </div>
  )
}