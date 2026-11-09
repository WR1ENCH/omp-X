import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BashCard } from '@/components/transcript/tools/BashCard'
import { LayoutStateProvider } from '@/hooks/useLayoutState'
import type { ToolCallBlock } from '@/types/transcript'

function makeBlock(result: unknown): ToolCallBlock {
  return {
    id: 'b1',
    type: 'tool-call',
    toolName: 'bash',
    toolCallId: 'c1',
    args: { command: 'cat /etc/hosts' },
    status: 'completed',
    result,
    timestamp: 1,
  }
}

function renderBash(result: unknown, isError = false) {
  const block = makeBlock(result)
  const openDockTab = vi.fn()
  const utils = render(
    <LayoutStateProvider>
      <BashCard block={block} args={block.args} isError={isError} openDockTab={openDockTab} />
    </LayoutStateProvider>,
  )
  return { ...utils, openDockTab }
}

afterEach(cleanup)

describe('BashCard', () => {
  it('highlights the command', () => {
    renderBash('out')
    expect(screen.getByTestId('tool-command')).toHaveTextContent('cat /etc/hosts')
  })

  it('copies the result text via the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderBash('file contents')
    fireEvent.click(screen.getByRole('button', { name: 'tool.copy' }))
    expect(writeText).toHaveBeenCalledWith('file contents')
  })

  it('routes :line:col paths to the diff dock and bare paths to preview', () => {
    const { openDockTab } = renderBash('hit /abs/path.ts:12:34 and ./rel.log')
    fireEvent.click(screen.getByRole('button', { name: '/abs/path.ts:12:34' }))
    expect(openDockTab).toHaveBeenCalledWith('diff')
    fireEvent.click(screen.getByRole('button', { name: './rel.log' }))
    expect(openDockTab).toHaveBeenCalledWith('preview')
  })

  it('truncates output beyond 10KB and View More expands it inline', () => {
    const big = 'x'.repeat(10 * 1024 + 50)
    const { container } = renderBash(big)
    expect(screen.getByText('tool.viewMore')).toBeVisible()
    expect(container.textContent).not.toContain(big)
    fireEvent.click(screen.getByText('tool.viewMore'))
    expect(screen.queryByText('tool.viewMore')).toBeNull()
    expect(container.textContent).toContain(big)
  })

  it('renders error results under the error label', () => {
    renderBash('boom', true)
    expect(screen.getByText('tool.error')).toBeVisible()
    expect(screen.getByText('boom')).toBeVisible()
  })
})
