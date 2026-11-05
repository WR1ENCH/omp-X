import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Block } from '@/types/transcript'
import { format } from 'date-fns'

interface MessageBlockProps {
  block: Block
  message: { role: 'user' | 'assistant' | 'system'; timestamp: number }
}

function formatTime(timestamp: number) {
  return format(new Date(timestamp), 'HH:mm')
}

function renderMarkdown(content: string) {
  return content
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/\n/g, '<br />')
}

export function MessageBlock({ block, message }: MessageBlockProps) {
  const isUser = message.role === 'user'
  const time = useMemo(() => formatTime(message.timestamp), [message.timestamp])

  const content = useMemo(() => {
    if (block.type === 'user' || block.type === 'assistant') {
      return renderMarkdown(block.content)
    }
    return ''
  }, [block])

  return (
    <div
      className={cn(
        'w-full px-4 py-2',
        isUser ? 'flex justify-end' : 'flex justify-start'
      )}
      data-role={message.role}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2',
          isUser
            ? 'bg-[var(--accent)] text-white rounded-br-md'
            : 'bg-[var(--bg-elevated)] text-[var(--fg-primary)] rounded-bl-md border border-[var(--border)]'
        )}
      >
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: content }}
        />
        <div
          className={cn(
            'flex items-center gap-1.5 mt-1.5 text-xs',
            isUser ? 'justify-end text-white/70' : 'justify-start text-[var(--fg-muted)]'
          )}
        >
          <span>{time}</span>
          {block.type === 'assistant' && block.streaming && (
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
          )}
        </div>
      </div>
    </div>
  )
}