import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { AssistantBlock, Message, UserBlock } from '@/types/transcript'
import { format } from 'date-fns'
import MarkdownIt from 'markdown-it'

interface MessageBlockProps {
  block: UserBlock | AssistantBlock
  message: Message
}

// html:false is a hard requirement: model output is untrusted. With html:true
// a completion containing <script> or an onerror handler reaches
// dangerouslySetInnerHTML verbatim and executes in the webview.
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
})

function formatTime(timestamp: number) {
  return format(new Date(timestamp), 'HH:mm')
}

/**
 * Renders a user or assistant message body.
 *
 * While the assistant block is streaming we render plain text instead of
 * markdown: re-parsing a growing document every animation frame is O(n²) and
 * makes high token rates stutter. Markdown is applied once the block settles.
 */
export const MessageBlock = memo(function MessageBlock({ block, message }: MessageBlockProps) {
  const isUser = message.role === 'user'
  const isStreaming = block.type === 'assistant' && block.streaming === true
  const time = formatTime(message.timestamp)

  const html = useMemo(() => (isStreaming ? '' : md.render(block.content)), [block.content, isStreaming])

  return (
    <div
      className={cn('w-full px-4 py-2', isUser ? 'flex justify-end' : 'flex justify-start')}
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
        {isStreaming ? (
          <pre className="md-body max-w-none whitespace-pre-wrap">{block.content}</pre>
        ) : (
          <div
            // markdown-it output styling. `prose` needs @tailwindcss/typography,
            // which is deliberately not a dependency here, so the same rules are
            // declared explicitly against the token layer.
            className="md-body max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
        <div
          className={cn(
            'flex items-center gap-1.5 mt-1.5 text-xs',
            isUser ? 'justify-end text-white/70' : 'justify-start text-[var(--fg-muted)]'
          )}
        >
          <span>{time}</span>
          {isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />}
        </div>
      </div>
    </div>
  )
})
