import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'

const { transcriptMock, invokeMock, sessionStoreMock } = vi.hoisted(() => ({
  transcriptMock: { isStreaming: false, addUserMessage: vi.fn() },
  invokeMock: vi.fn(),
  sessionStoreMock: {
    getState: vi.fn(() => ({ sessions: [] })),
    spawnSession: vi.fn(async () => 's2'),
  },
}))

vi.mock('@/hooks/useTranscript', () => ({
  useTranscript: () => transcriptMock,
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

vi.mock('@/lib/sessionStore', () => ({ sessionStore: sessionStoreMock }))

import { useComposer } from '@/hooks/useComposer'
import { SlashMenu } from './SlashMenu'

/**
 * Mirrors production wiring: useComposer listens for the omp:available-commands
 * window event (forwarded from the real available_commands_update wire event
 * by useTranscript) and feeds SlashMenu from that state — no mock fill.
 */
function Harness() {
  const { availableCommands } = useComposer('s1')
  return (
    <SlashMenu commands={availableCommands} query="" onSelect={vi.fn()} onClose={vi.fn()} />
  )
}

beforeEach(() => {
  transcriptMock.isStreaming = false
  transcriptMock.addUserMessage.mockReset()
  invokeMock.mockReset()
})

afterEach(cleanup)

describe('SlashMenu', () => {
  it('shows /switch when it arrives through the omp:available-commands window event', async () => {
    render(<Harness />)

    act(() => {
      window.dispatchEvent(
        new CustomEvent('omp:available-commands', {
          detail: [{ name: 'switch', description: 'Switch the active model' }],
        }),
      )
    })

    await waitFor(() => expect(screen.getByText('/switch')).toBeInTheDocument())
  })
})
