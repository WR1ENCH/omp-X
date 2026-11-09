import { cn } from '@/lib/utils'
import { ThinkingBlock as ThinkingBlockType } from '@/types/transcript'
import { useState } from 'react'
import { ChevronDown, Brain } from 'lucide-react'

interface ThinkingBlockProps {
  block: ThinkingBlockType
}

export function ThinkingBlock({ block }: ThinkingBlockProps) {
  // Local UI state. The provider flips `block.collapsed` when the message
  // finalizes; Transcript keys this component on `id:collapsed`, so that flip
  // remounts it and re-seeds this state (an effect would be both forbidden by
  // the react-hooks lint rules and a cascading render).
  const [collapsed, setCollapsed] = useState(block.collapsed)

  return (
    <div className="w-full px-4 py-2">
      {/* Controlled <details>: `open` is driven by state and onToggle mirrors the
          native toggle back into it. The previous version called preventDefault
          and never set `open`, so the body could never be revealed. */}
      <details className="group" open={!collapsed} onToggle={() => setCollapsed((value) => !value)}>
        <summary
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer',
            'bg-[var(--bg-hover)] border border-[var(--border)]',
            'text-[var(--fg-secondary)] text-sm font-medium',
            'transition-colors hover:bg-[var(--bg-active)]'
          )}
        >
          <Brain size={14} className="text-[var(--accent)]" />
          <span>Thinking…</span>
          <ChevronDown size={12} className={cn('ml-auto transition-transform', collapsed && '-rotate-90')} />
        </summary>
        <div className="mt-2 px-3 pb-2 text-sm text-[var(--fg-muted)] whitespace-pre-wrap">{block.content}</div>
      </details>
    </div>
  )
}
