import { useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useTranscript } from '@/hooks/useTranscript'
import { useVirtualScroll } from '@/hooks/useVirtualScroll'
import { VirtualItem } from '@/types/transcript'
import { MessageBlock } from './MessageBlock'
import { SystemEventLine } from './SystemEventLine'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCard } from './ToolCard'

interface TranscriptProps {
  sessionId: string | null
}

export function Transcript({ sessionId }: TranscriptProps) {
  const { t } = useTranslation()
  const endRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    isStreaming,
    anchorToBottom,
    setAnchorToBottom,
    getTotalHeight,
    pendingToolCalls,
  } = useTranscript(sessionId)

  const { virtualItems, scrollToBottom, measureElement, parentRef } = useVirtualScroll({
    messages,
    onScrollToBottom: () => setAnchorToBottom(true),
  })

  useEffect(() => {
    if (anchorToBottom && !isStreaming) {
      scrollToBottom()
    }
  }, [messages.length, anchorToBottom, isStreaming, scrollToBottom])

  useEffect(() => {
    if (isStreaming && anchorToBottom) {
      scrollToBottom()
    }
  }, [isStreaming, anchorToBottom, scrollToBottom])

  const handleScroll = useCallback(() => {
    if (!parentRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 24
    setAnchorToBottom(isNearBottom)
  }, [setAnchorToBottom, parentRef])

  const renderItem = useCallback(
    ({ message, index }: VirtualItem) => {
      const isLast = index === messages.length - 1

      return (
        <div
          key={message.id}
          ref={(el) => el && measureElement(index, el)}
          className={cn('w-full', isLast && 'pb-4')}
        >
          {message.blocks.map((block) => {
            switch (block.type) {
              case 'user':
              case 'assistant':
                return <MessageBlock key={block.id} block={block} message={message} />
              case 'thinking':
                return <ThinkingBlock key={block.id} block={block} />
              case 'tool-call':
              case 'tool-result':
                const pending = pendingToolCalls.get(
                  block.type === 'tool-call' ? block.toolCallId : block.toolCallId
                )
                return <ToolCard key={block.id} block={block} pending={pending} />
              case 'system':
                return <SystemEventLine key={block.id} block={block} />
              default:
                return null
            }
          })}
        </div>
      )
    },
    [messages, pendingToolCalls, measureElement]
  )

  const totalHeight = getTotalHeight()

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      className={cn('flex flex-col h-full overflow-auto', 'bg-[var(--bg-base)]')}
      role="log"
      aria-live="polite"
      aria-label={t('sidebar.sessions.title')}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {virtualItems.map(renderItem)}
      </div>
      <div ref={endRef} className="h-4" />
      {isStreaming && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-[var(--accent-muted)] text-[var(--accent)] text-sm font-medium animate-pulse">
          {t('composer.placeholder')}
        </div>
      )}
    </div>
  )
}