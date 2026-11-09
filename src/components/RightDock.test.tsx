import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RightDock } from '@/components/RightDock'
import { LayoutStateProvider } from '@/hooks/useLayoutState'

/**
 * The dock keeps every tab mounted so a tab switch cannot unmount the terminal
 * (whose cleanup runs `pty_kill`) or discard the editor draft. These tests pin
 * the terminal behavior: the probe stays mounted with the same pid across tab
 * switches and no kill is issued.
 */
const terminalState = vi.hoisted(() => {
  const state = { pid: null as number | null, connectCalls: 0, killCalls: 0 }
  return {
    state,
    connect: async () => {
      state.connectCalls += 1
      state.pid = state.connectCalls
    },
    kill: async () => {
      state.killCalls += 1
    },
  }
})

vi.mock('@/hooks/useTerminal', () => ({
  useTerminal: () => ({
    connected: terminalState.state.pid != null,
    connecting: false,
    cols: 80,
    rows: 24,
    pid: terminalState.state.pid,
    error: null,
    connect: terminalState.connect,
    disconnect: terminalState.kill,
    write: vi.fn(),
    resize: vi.fn(),
    attachXterm: vi.fn(() => () => {}),
  }),
}))

vi.mock('@/components/dock/DockTabs', async () => {
  const React = await import('react')
  const { useEffect } = await import('react')
  const { useTerminal } = await import('@/hooks/useTerminal')

  function TerminalProbe() {
    const { pid, connect } = useTerminal() as ReturnType<typeof useTerminal>
    useEffect(() => {
      void connect()
    }, [connect])
    return React.createElement(
      'div',
      { 'data-testid': 'terminal-probe' },
      `PID: ${pid ?? 'none'}`,
    )
  }

  return {
    renderDockTab: (tab: string) =>
      tab === 'terminal'
        ? React.createElement(TerminalProbe)
        : React.createElement('div', { 'data-testid': `tab-${tab}` }, tab),
  }
})

afterEach(cleanup)

describe('RightDock', () => {
  beforeEach(() => {
    terminalState.state.pid = null
    terminalState.state.connectCalls = 0
    terminalState.state.killCalls = 0
  })

  it('keeps the terminal mounted and its PTY alive across tab switches', async () => {
    render(
      <LayoutStateProvider>
        <RightDock />
      </LayoutStateProvider>,
    )

    // Activate the terminal tab and wait for the PTY to connect.
    fireEvent.click(screen.getByRole('tab', { name: /dock\.terminal/ }))
    await waitFor(() => {
      expect(screen.getByTestId('terminal-probe')).toHaveTextContent('PID: 1')
    })

    // Switch away: the terminal panel is hidden but stays mounted, and the PTY
    // is not killed.
    fireEvent.click(screen.getByRole('tab', { name: /dock\.diff/ }))
    expect(screen.getByTestId('terminal-probe')).toHaveTextContent('PID: 1')
    expect(screen.getByTestId('terminal-probe')).not.toBeVisible()
    expect(terminalState.state.connectCalls).toBe(1)
    expect(terminalState.state.killCalls).toBe(0)

    // Switching back must not respawn the PTY.
    fireEvent.click(screen.getByRole('tab', { name: /dock\.terminal/ }))
    expect(screen.getByTestId('terminal-probe')).toHaveTextContent('PID: 1')
    expect(screen.getByTestId('terminal-probe')).toBeVisible()
    expect(terminalState.state.connectCalls).toBe(1)
    expect(terminalState.state.killCalls).toBe(0)
  })
})
