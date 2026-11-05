import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { Message, VirtualItem, estimateMessageHeight } from '@/types/transcript'

interface UseVirtualScrollOptions {
  messages: Message[]
  overscan?: number
  estimateHeight?: (message: Message) => number
  onScrollToBottom?: () => void
}

interface UseVirtualScrollReturn {
  virtualizer: Virtualizer<HTMLDivElement, Element>
  virtualItems: VirtualItem[]
  totalHeight: number
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end' | 'auto') => void
  scrollToBottom: () => void
  measureElement: (index: number, element: HTMLElement | null) => void
  parentRef: React.RefObject<HTMLDivElement>
}

export function useVirtualScroll({
  messages,
  overscan = 5,
  estimateHeight = estimateMessageHeight,
  onScrollToBottom,
}: UseVirtualScrollOptions): UseVirtualScrollReturn {
  const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(new Map())
  const parentRef = useRef<HTMLDivElement>(null)

  const getItemHeight = useCallback(
    (index: number) => {
      if (measuredHeights.has(index)) return measuredHeights.get(index)!
      const message = messages[index]
      return message ? estimateHeight(message) : 100
    },
    [measuredHeights, messages, estimateHeight]
  )

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getItemHeight,
    overscan,
    gap: 8,
    horizontal: false,
    paddingStart: 16,
    paddingEnd: 16,
    initialOffset: 0,
  })

  const virtualItems = useMemo(() => {
    return virtualizer.getVirtualItems().map((item) => ({
      index: item.index,
      start: item.start,
      end: item.end,
      size: item.size,
      message: messages[item.index],
    }))
  }, [virtualizer, messages])

  const totalHeight = useMemo(() => {
    return messages.reduce((sum, msg, idx) => {
      return sum + (measuredHeights.has(idx) ? measuredHeights.get(idx)! : estimateHeight(msg))
    }, 0)
  }, [messages, measuredHeights, estimateHeight])

  const scrollToIndex = useCallback(
    (index: number, align: 'start' | 'center' | 'end' | 'auto' = 'auto') => {
      virtualizer.scrollToIndex(index, { align })
    },
    [virtualizer]
  )

  const scrollToBottom = useCallback(() => {
    virtualizer.scrollToOffset(virtualizer.getTotalSize(), { align: 'end' })
    onScrollToBottom?.()
  }, [virtualizer, onScrollToBottom])

  const measureElement = useCallback((index: number, element: HTMLElement | null) => {
    if (!element) return
    const height = element.getBoundingClientRect().height
    if (height > 0 && height !== measuredHeights.get(index)) {
      setMeasuredHeights((prev) => {
        const next = new Map(prev)
        next.set(index, height)
        return next
      })
    }
  }, [measuredHeights])

  const handleScroll = useCallback(() => {
    if (!parentRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 24
    if (isNearBottom) {
      onScrollToBottom?.()
    }
  }, [onScrollToBottom])

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