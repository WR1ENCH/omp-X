import { cn } from '@/lib/utils'
import { ThinkingBlock as ThinkingBlockType } from '@/types/transcript'
import { useState } from 'react'
import { ChevronDown, Brain } from 'lucide-react'

interface ThinkingBlockProps {
  block: ThinkingBlockType
}

export function ThinkingBlock({ block }: ThinkingBlockProps) {
  const [collapsed, setCollapsed] = useState(block.collapsed)

  return (
    <div className="w-full px-4 py-2">
      <details className={cn('group', collapsed && '')}>
        <summary
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer',
            'bg-[var(--bg-hover)] border border-[var(--border)]',
            'text-[var(--fg-secondary)] text-sm font-medium',
            'transition-colors hover:bg-[var(--bg-active)]'
          )}
          onClick={(e) => {
            e.preventDefault()
            setCollapsed((c) => !c)
          }}
        >
          <Brain size={14} className="text-[var(--accent)]" />
          <span>Thinking…</span>
          <ChevronDown size={12} className={cn('ml-auto transition-transform', collapsed && '-rotate-90')} />
        </summary>
        <div className={cn('mt-2 px-3 pb-2 text-sm text-[var(--fg-muted)] whitespace-pre-wrap', collapsed && 'hidden')}>
          {block.content}
        </div>
      </details>
    </div>
  )
}