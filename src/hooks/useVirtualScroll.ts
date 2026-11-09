import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { Message, VirtualItem, estimateMessageHeight } from '@/types/transcript'

interface UseVirtualScrollOptions {
  messages: Message[]
  overscan?: number
  estimateHeight?: (message: Message) => number
  onScrollToBottom?: () => void
  onScrollAway?: () => void
}

export type TranscriptVirtualItem = VirtualItem & { key: string | number }

interface UseVirtualScrollReturn {
  virtualizer: Virtualizer<HTMLDivElement, Element>
  virtualItems: TranscriptVirtualItem[]
  totalHeight: number
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end' | 'auto') => void
  scrollToBottom: () => void
  measureElement: (element: HTMLElement | null) => void
  parentRef: RefObject<HTMLDivElement>
}

/**
 * Virtualizes the transcript with @tanstack/react-virtual.
 *
 * Layout model: every row is absolutely positioned at `virtualItem.start`
 * inside a `position: relative` spacer whose height is `virtualizer.getTotalSize()`.
 * There is exactly one transform per row and the spacer carries the total size,
 * so rows can never accumulate offsets (the previous implementation rendered
 * normal-flow rows *and* translated them, double-counting `start`).
 *
 * Measured heights are fed back through `virtualizer.measureElement`, which is a
 * ref callback that reads `data-index` and calls `resizeItem` under the hood.
 * The virtualizer's `estimateSize` is only a first-pass guess; once a row is
 * measured the measurement cache (and therefore `getTotalSize`) is authoritative.
 */
export function useVirtualScroll({
  messages,
  overscan = 5,
  estimateHeight = estimateMessageHeight,
  onScrollToBottom,
  onScrollAway,
}: UseVirtualScrollOptions): UseVirtualScrollReturn {
  const parentRef = useRef<HTMLDivElement>(null)

  // Read the latest props through refs so the callbacks below stay referentially
  // stable. Unstable callbacks here used to feed a Transcript effect and caused
  // "Maximum update depth exceeded".
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const estimateRef = useRef(estimateHeight)
  estimateRef.current = estimateHeight
  const onScrollToBottomRef = useRef(onScrollToBottom)
  onScrollToBottomRef.current = onScrollToBottom
  const onScrollAwayRef = useRef(onScrollAway)
  onScrollAwayRef.current = onScrollAway

  const getItemKey = useCallback((index: number) => {
    return messagesRef.current[index]?.id ?? String(index)
  }, [])

  const estimateSize = useCallback((index: number) => {
    const message = messagesRef.current[index]
    return message ? estimateRef.current(message) : 100
  }, [])

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    getItemKey,
    overscan,
    gap: 8,
    horizontal: false,
    paddingStart: 16,
    paddingEnd: 16,
    initialOffset: 0,
  })

  // `getVirtualItems()` is memoized inside the virtualizer, but its inputs
  // (scrollRect, range, measurements) change without a new `virtualizer`
  // identity or `messages` reference, so wrapping it in useMemo here would
  // serve stale rows after the first scroll/measure update.
  const virtualItems: TranscriptVirtualItem[] = virtualizer.getVirtualItems().map((item) => ({
    index: item.index,
    start: item.start,
    end: item.end,
    size: item.size,
    // getItemKey returns message ids (strings); the virtualizer's Key union
    // is wider (string | number | bigint), so narrow it here.
    key: item.key as string | number,
    message: messages[item.index],
  }))

  const totalHeight = virtualizer.getTotalSize()

  const scrollToIndex = useCallback(
    (index: number, align: 'start' | 'center' | 'end' | 'auto' = 'auto') => {
      virtualizer.scrollToIndex(index, { align })
    },
    [virtualizer],
  )

  const scrollToBottom = useCallback(() => {
    virtualizer.scrollToOffset(virtualizer.getTotalSize(), { align: 'end' })
    onScrollToBottomRef.current?.()
  }, [virtualizer])

  const measureElement = useCallback(
    (element: HTMLElement | null) => {
      virtualizer.measureElement(element)
    },
    [virtualizer],
  )

  const handleScroll = useCallback(() => {
    const element = parentRef.current
    if (!element) return
    const { scrollTop, scrollHeight, clientHeight } = element
    // Scrolling away from the bottom releases the "stick to newest" anchor;
    // returning to within 24px of the bottom re-engages it.
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 24
    if (isNearBottom) onScrollToBottomRef.current?.()
    else onScrollAwayRef.current?.()
  }, [])

  useEffect(() => {
    const element = parentRef.current
    if (!element) return
    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => element.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  return {
    virtualizer,
    virtualItems,
    totalHeight,
    scrollToIndex,
    scrollToBottom,
    measureElement,
    parentRef,
  }
}
