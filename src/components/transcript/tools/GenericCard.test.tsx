import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GenericCard } from '@/components/transcript/tools/GenericCard'
import { LayoutStateProvider } from '@/hooks/useLayoutState'
import type { ToolCallBlock } from '@/types/transcript'

function renderGeneric(args: Record<string, unknown>, result: unknown) {
  const block: ToolCallBlock = {
    id: 'b1',
    type: 'tool-call',
    toolName: 'mystery',
    toolCallId: 'c1',
    args,
    status: 'completed',
    ...(result !== undefined ? { result } : {}),
    timestamp: 1,
  }
  const openDockTab = vi.fn()
  const utils = render(
    <LayoutStateProvider>
      <GenericCard block={block} args={args} isError={false} openDockTab={openDockTab} />
    </LayoutStateProvider>,
  )
  return { ...utils, openDockTab }
}

afterEach(cleanup)

describe('GenericCard', () => {
  it('renders args JSON and result text', () => {
    const { container } = renderGeneric({ foo: 'bar' }, 'plain text')
    expect(container.textContent).toContain('"foo": "bar"')
    expect(screen.getByText('plain text')).toBeVisible()
  })

  it('does not crash when the result is missing', () => {
    renderGeneric({ foo: 'bar' }, undefined)
    expect(screen.getByText('tool.arguments')).toBeVisible()
    expect(screen.queryByText('tool.result')).toBeNull()
  })

  it('opens the full output in the dock', () => {
    const { openDockTab } = renderGeneric({}, 'out')
    fireEvent.click(screen.getByText('tool.openFullOutput'))
    expect(openDockTab).toHaveBeenCalledWith('preview')
  })
})
