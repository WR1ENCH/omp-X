import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ToolCard, ToolRendererMap } from '@/components/transcript/ToolCard'
import { LayoutStateProvider, useLayoutState } from '@/hooks/useLayoutState'
import type { ToolCallBlock } from '@/types/transcript'

function makeCall(overrides: Partial<ToolCallBlock> = {}): ToolCallBlock {
  return {
    id: 'b1',
    type: 'tool-call',
    toolName: 'bash',
    toolCallId: 'c1',
    args: {},
    status: 'completed',
    timestamp: 1,
    ...overrides,
  }
}

function DockProbe() {
  const { state, toggleDock } = useLayoutState()
  return (
    <div>
      <button type="button" data-testid="toggle-dock" onClick={toggleDock}>
        toggle-dock
      </button>
      <span data-testid="dock-state">
        {JSON.stringify({ collapsed: state.dockCollapsed, tab: state.dockTab })}
      </span>
    </div>
  )
}

function renderToolCard(block: ToolCallBlock) {
  return render(
    <LayoutStateProvider>
      <DockProbe />
      <ToolCard block={block} />
    </LayoutStateProvider>,
  )
}

function dockState(): { collapsed: boolean; tab: string } {
  return JSON.parse(screen.getByTestId('dock-state').textContent ?? '{}') as {
    collapsed: boolean
    tab: string
  }
}

afterEach(cleanup)

describe('ToolCard dispatch', () => {
  it('renders the raw tool name for e2e stability', () => {
    renderToolCard(makeCall({ toolName: 'bash', args: { command: 'echo hi' } }))
    expect(screen.getByText('bash', { exact: true })).toBeVisible()
  })

  it('routes bash to the bash renderer (command summary)', () => {
    renderToolCard(makeCall({ toolName: 'bash', args: { command: 'echo dispatch-me' } }))
    expect(screen.getByText(/echo dispatch-me/)).toBeVisible()
  })

  it('routes read to the file renderer (path summary)', () => {
    renderToolCard(makeCall({ toolName: 'read', args: { file_path: '/src/a.ts' } }))
    expect(screen.getByText('/src/a.ts')).toBeVisible()
  })

  it('falls back to the generic renderer for unknown tools', () => {
    renderToolCard(makeCall({ toolName: 'mystery', args: { zz: 1 } }))
    expect(screen.getByText('{"zz":1}')).toBeVisible()
  })

  it('exposes renderers for the known tools', () => {
    expect(Object.keys(ToolRendererMap)).toEqual(
      expect.arrayContaining(['bash', 'read', 'write', 'edit']),
    )
  })
})

describe('ToolCard collapse / expand', () => {
  it('collapses to icon + one-line summary + status badge by default', () => {
    renderToolCard(makeCall({ toolName: 'bash', args: { command: 'echo hi' }, status: 'running' }))
    expect(screen.getByText('bash', { exact: true })).toBeVisible()
    expect(screen.getByText('tool.statusRunning')).toBeVisible()
    expect(screen.queryByText('tool.arguments')).toBeNull()
  })

  it('expands to args JSON, output and the open-full-output button', () => {
    renderToolCard(
      makeCall({
        toolName: 'bash',
        args: { command: 'echo hi' },
        result: { content: [{ type: 'text', text: 'out' }] },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: /bash/ }))
    expect(screen.getByText('tool.arguments')).toBeVisible()
    expect(screen.getByText('tool.openFullOutput')).toBeVisible()
  })

  it.each([
    ['pending', 'tool.statusRunning'],
    ['running', 'tool.statusRunning'],
    ['failed', 'tool.statusFailed'],
    ['completed', 'tool.statusDone'],
  ] as const)('maps status %s to badge %s', (status, label) => {
    renderToolCard(makeCall({ status }))
    expect(screen.getByText(label)).toBeVisible()
  })
})

describe('ToolCard open-full-output dock semantics', () => {
  it('opens the dock on the preview tab when it was collapsed (ensure-open)', () => {
    renderToolCard(makeCall({ toolName: 'bash', args: { command: 'echo hi' } }))
    fireEvent.click(screen.getByTestId('toggle-dock'))
    expect(dockState()).toEqual({ collapsed: true, tab: 'preview' })
    fireEvent.click(screen.getByRole('button', { name: /bash/ }))
    fireEvent.click(screen.getByText('tool.openFullOutput'))
    expect(dockState()).toEqual({ collapsed: false, tab: 'preview' })
  })

  it('keeps an already-open dock open instead of flipping it shut', () => {
    renderToolCard(makeCall({ toolName: 'bash', args: { command: 'echo hi' } }))
    expect(dockState().collapsed).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /bash/ }))
    fireEvent.click(screen.getByText('tool.openFullOutput'))
    expect(dockState()).toEqual({ collapsed: false, tab: 'preview' })
  })

  it('clickable bash output paths open the right dock tab', () => {
    renderToolCard(
      makeCall({
        toolName: 'bash',
        args: { command: 'echo hi' },
        result: { content: [{ type: 'text', text: 'see /a/b.ts:3:4 and ./c.log' }] },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: /bash/ }))
    fireEvent.click(screen.getByRole('button', { name: '/a/b.ts:3:4' }))
    expect(dockState()).toEqual({ collapsed: false, tab: 'diff' })
    fireEvent.click(screen.getByRole('button', { name: './c.log' }))
    expect(dockState()).toEqual({ collapsed: false, tab: 'preview' })
  })
})
