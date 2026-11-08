import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useTranscript } from '@/hooks/useTranscript'
import { useVirtualScroll, type TranscriptVirtualItem } from '@/hooks/useVirtualScroll'
import { MessageBlock } from './MessageBlock'
import { SystemEventLine } from './SystemEventLine'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCard } from './ToolCard'

export function Transcript() {
  const { t } = useTranslation()

  const { messages, pendingToolCalls, anchorToBottom, setAnchorToBottom } = useTranscript()

  const handleScrollToBottom = useCallback(() => setAnchorToBottom(true), [setAnchorToBottom])
  const handleScrollAway = useCallback(() => setAnchorToBottom(false), [setAnchorToBottom])

  const { virtualItems, totalHeight, scrollToBottom, measureElement, parentRef } = useVirtualScroll({
    messages,
    onScrollToBottom: handleScrollToBottom,
    onScrollAway: handleScrollAway,
  })

  // Content length of the tail message. It changes on every streaming flush,
  // giving the anchoring effect a stable primitive to key on instead of the
  // (unstable) messages array identity.
  const tailLength = useMemo(() => {
    const last = messages[messages.length - 1]
    if (!last) return 0
    let total = 0
    for (const block of last.blocks) {
      if ('content' in block && typeof block.content === 'string') total += block.content.length
    }
    return total
  }, [messages])

  // Keep the latest stable callback in a ref so the effect below never depends
  // on a function identity (the old version depended on `scrollToBottom` and
  // blew up with "Maximum update depth exceeded").
  const scrollToBottomRef = useRef(scrollToBottom)
  useEffect(() => {
    scrollToBottomRef.current = scrollToBottom
  }, [scrollToBottom])

  const previousTail = useRef({ count: messages.length, length: tailLength })
  useEffect(() => {
    const countChanged = messages.length !== previousTail.current.count
    const lengthChanged = tailLength !== previousTail.current.length
    previousTail.current = { count: messages.length, length: tailLength }
    if ((countChanged || lengthChanged) && anchorToBottom) {
      scrollToBottomRef.current()
    }
  }, [messages.length, tailLength, anchorToBottom])

  const renderItem = useCallback(
    (item: TranscriptVirtualItem) => {
      const message = item.message
      return (
        <div
          key={item.key}
          data-index={item.index}
          ref={measureElement}
          className="w-full"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${item.start}px)`,
          }}
        >
          {message.blocks.map((block) => {
            switch (block.type) {
              case 'user':
              case 'assistant':
                return <MessageBlock key={block.id} block={block} message={message} />
              case 'thinking':
                // Keying on `collapsed` remounts the block when the provider
                // finalizes it, re-seeding its local collapsed state.
                return <ThinkingBlock key={`${block.id}:${block.collapsed}`} block={block} />
              case 'tool-call':
              case 'tool-result': {
                const pending = pendingToolCalls.get(block.toolCallId)
                return <ToolCard key={block.id} block={block} pending={pending} />
              }
              case 'system':
                return <SystemEventLine key={block.id} block={block} />
              default:
                return null
            }
          })}
        </div>
      )
    },
    [pendingToolCalls, measureElement],
  )

  return (
    <div
      ref={parentRef}
      className={cn('flex flex-col h-full overflow-auto', 'bg-[var(--bg-base)]')}
      role="log"
      aria-live="off"
      aria-label={t('sidebar.sessions.title')}
    >
      {/* Spacer carries the total virtualized height; rows are absolutely
          positioned inside it, so each row is offset exactly once. */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {virtualItems.map(renderItem)}
      </div>
    </div>
  )
}
