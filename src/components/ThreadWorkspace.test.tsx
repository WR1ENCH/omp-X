import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { ThreadWorkspace } from './ThreadWorkspace'
import type { ApprovalRequest } from '@/types/approval'

const approvalState = vi.hoisted(() => ({
  pending: new Map<string, ApprovalRequest>(),
}))

vi.mock('@/hooks/useApproval', () => ({
  useApproval: () => ({
    pendingRequests: approvalState.pending,
    respond: vi.fn(),
    toasts: [],
    dismissToast: vi.fn(),
    statusItems: [],
    widgetItems: [],
    titleItem: null,
  }),
}))

vi.mock('@/hooks/useTranscript', () => ({
  TranscriptProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/components/transcript/Transcript', () => ({
  Transcript: () => null,
}))

vi.mock('@/components/approval/ApprovalModal', () => ({
  ApprovalModal: () => null,
}))

vi.mock('@/components/approval/Toast', () => ({
  ToastContainer: () => null,
}))

vi.mock('@/components/approval/StatusBar', () => ({
  StatusBar: () => null,
}))

vi.mock('@/components/composer/Composer', async () => {
  const React = await import('react')
  return {
    Composer: (props: { sessionId: string | null; disabled?: boolean }) =>
      React.createElement('div', {
        'data-testid': 'composer',
        'data-disabled': String(props.disabled === true),
        'data-session': props.sessionId ?? 'none',
      }),
  }
})

afterEach(() => {
  cleanup()
  approvalState.pending.clear()
})

describe('ThreadWorkspace', () => {
  it('passes disabled to Composer while an approval request is pending', () => {
    approvalState.pending.set('req-1', {
      id: 'req-1',
      method: 'select',
      title: 'Allow tool: bash',
      timestamp: 1,
    })

    render(<ThreadWorkspace sessionId="s1" />)

    expect(screen.getByTestId('composer')).toHaveAttribute('data-disabled', 'true')
  })

  it('leaves Composer enabled when no approval request is pending', () => {
    render(<ThreadWorkspace sessionId="s1" />)

    expect(screen.getByTestId('composer')).toHaveAttribute('data-disabled', 'false')
    expect(screen.getByTestId('composer')).toHaveAttribute('data-session', 's1')
  })
})
