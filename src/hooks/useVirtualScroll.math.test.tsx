/* eslint-disable react-hooks/globals, react-hooks/refs -- test probe intentionally captures the hook result during render and forwards refs to JSX */
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/types/transcript'
import { useVirtualScroll } from './useVirtualScroll'

const ESTIMATE = 100
const GAP = 8
const PADDING = 16
const VIEWPORT = 300

function makeMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    role: 'assistant' as const,
    blocks: [
      {
        id: `b${i}`,
        type: 'assistant' as const,
        content: `msg ${i}`,
        streaming: false,
        timestamp: 0,
      },
    ],
    timestamp: 0,
    sessionId: 's1',
  }))
}

let latest: ReturnType<typeof useVirtualScroll> | null = null

function Probe({ messages }: { messages: Message[] }) {
  const scroll = useVirtualScroll({ messages, estimateHeight: () => ESTIMATE })
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
  // jsdom reports 0 for layout sizes; give the virtualizer a real viewport and
  // let rows measure back to the estimate so the math stays deterministic.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(VIEWPORT)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(ESTIMATE)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useVirtualScroll math', () => {
  it('computes total height as count*estimate + gaps + padding', () => {
    render(<Probe messages={makeMessages(10)} />)
    expect(latest?.totalHeight).toBe(10 * ESTIMATE + 9 * GAP + PADDING * 2)
  })

  it('positions rows absolutely with exactly one offset each', () => {
    render(<Probe messages={makeMessages(10)} />)
    const items = latest?.virtualItems ?? []
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].start).toBe(PADDING)
    expect(items[0].size).toBe(ESTIMATE)
    expect(items[0].end).toBe(PADDING + ESTIMATE)
    for (let i = 1; i < items.length; i++) {
      expect(items[i].start).toBe(items[i - 1].end + GAP)
    }
  })

  it('overscans beyond the visible range', () => {
    render(<Probe messages={makeMessages(10)} />)
    // 300px viewport / 100px rows => 3 visible rows (0..2); overscan 5 => 0..7.
    expect(latest?.virtualItems.map((item) => item.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('feeds a measured row height back into the virtualizer total', () => {
    const { container } = render(<Probe messages={makeMessages(10)} />)
    expect(latest?.totalHeight).toBe(1104)

    // Index 9 is outside the rendered window, so its key has no cached size
    // yet and the virtualizer must read offsetHeight from the DOM.
    const row = document.createElement('div')
    row.dataset.index = '9'
    Object.defineProperty(row, 'offsetHeight', { value: 250, configurable: true })
    container.appendChild(row)

    act(() => latest!.measureElement(row))
    expect(latest?.totalHeight).toBe(1104 + 150)
  })
})
