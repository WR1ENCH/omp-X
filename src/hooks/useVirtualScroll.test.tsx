/* eslint-disable react-hooks/globals, react-hooks/refs -- test probe intentionally captures the hook result during render and forwards refs to JSX */
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/types/transcript'
import { useVirtualScroll } from './useVirtualScroll'

const mocks = vi.hoisted(() => {
  const measureElement = vi.fn()
  const scrollToOffset = vi.fn()
  const scrollToIndex = vi.fn()
  const getTotalSize = vi.fn(() => 5000)
  const getVirtualItems = vi.fn((): Array<Record<string, unknown>> => [])
  const virtualizer = { measureElement, scrollToOffset, scrollToIndex, getTotalSize, getVirtualItems }
  return { virtualizer, measureElement, scrollToOffset, scrollToIndex, getTotalSize, getVirtualItems }
})

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => mocks.virtualizer,
}))

function makeMessage(id: string): Message {
  return {
    id,
    role: 'assistant',
    blocks: [{ id: `${id}-b`, type: 'assistant', content: id, streaming: false, timestamp: 0 }],
    timestamp: 0,
    sessionId: 's1',
  }
}

let latest: ReturnType<typeof useVirtualScroll> | null = null
let onBottom = vi.fn()
let onAway = vi.fn()

function Probe({ messages }: { messages: Message[] }) {
  const scroll = useVirtualScroll({
    messages,
    // Fresh closures on every render: the hook must read them through refs so
    // its own callbacks stay stable.
    onScrollToBottom: () => onBottom(),
    onScrollAway: () => onAway(),
  })
  latest = scroll
  return (
    <div ref={scroll.parentRef}>
      <div style={{ height: scroll.totalHeight, position: 'relative' }}>
        {scroll.virtualItems.map((item) => (
          <div key={item.key} data-index={item.index} ref={scroll.measureElement} />
        ))}
      </div>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  onBottom = vi.fn()
  onAway = vi.fn()
  mocks.getTotalSize.mockReturnValue(5000)
  mocks.getVirtualItems.mockReturnValue([])
})

describe('useVirtualScroll wiring', () => {
  it('reports the virtualizer total size', () => {
    render(<Probe messages={[makeMessage('m0')]} />)
    expect(latest?.totalHeight).toBe(5000)
  })

  it('maps virtual items to their message and key', () => {
    const messages = [makeMessage('m0'), makeMessage('m1')]
    mocks.getVirtualItems.mockReturnValue([{ index: 1, start: 124, end: 224, size: 100, key: 'm1' }])
    render(<Probe messages={messages} />)
    expect(latest?.virtualItems).toHaveLength(1)
    expect(latest?.virtualItems[0].message).toBe(messages[1])
    expect(latest?.virtualItems[0].key).toBe('m1')
    expect(latest?.virtualItems[0].start).toBe(124)
  })

  it('wires row refs to virtualizer.measureElement', () => {
    mocks.getVirtualItems.mockReturnValue([{ index: 0, start: 16, end: 116, size: 100, key: 'm0' }])
    const { container } = render(<Probe messages={[makeMessage('m0')]} />)
    const row = container.querySelector('[data-index="0"]')
    expect(row).not.toBeNull()
    expect(mocks.measureElement).toHaveBeenCalledWith(row)
  })

  it('delegates null elements to the virtualizer', () => {
    render(<Probe messages={[makeMessage('m0')]} />)
    act(() => latest!.measureElement(null))
    expect(mocks.measureElement).toHaveBeenCalledWith(null)
  })

  it('scrollToBottom scrolls to the end and notifies', () => {
    render(<Probe messages={[makeMessage('m0')]} />)
    act(() => latest!.scrollToBottom())
    expect(mocks.scrollToOffset).toHaveBeenCalledWith(5000, { align: 'end' })
    expect(onBottom).toHaveBeenCalledTimes(1)
  })

  it('keeps scrollToBottom referentially stable across rerenders', () => {
    const { rerender } = render(<Probe messages={[makeMessage('m0')]} />)
    const first = latest!.scrollToBottom
    rerender(<Probe messages={[makeMessage('m0')]} />)
    expect(latest!.scrollToBottom).toBe(first)
  })

  it('delegates scrollToIndex', () => {
    render(<Probe messages={[makeMessage('m0')]} />)
    act(() => latest!.scrollToIndex(3, 'end'))
    expect(mocks.scrollToIndex).toHaveBeenCalledWith(3, { align: 'end' })
  })

  it('notifies bottom/away using a 24px threshold', () => {
    render(<Probe messages={[makeMessage('m0')]} />)
    const element = latest!.parentRef.current!
    Object.defineProperty(element, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(element, 'clientHeight', { value: 300, configurable: true })
    Object.defineProperty(element, 'scrollTop', { value: 700, configurable: true })

    act(() => element.dispatchEvent(new Event('scroll')))
    expect(onBottom).toHaveBeenCalledTimes(1)
    expect(onAway).not.toHaveBeenCalled()

    Object.defineProperty(element, 'scrollTop', { value: 100, configurable: true })
    act(() => element.dispatchEvent(new Event('scroll')))
    expect(onAway).toHaveBeenCalledTimes(1)
    expect(onBottom).toHaveBeenCalledTimes(1)
  })
})
