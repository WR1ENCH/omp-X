import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { InputModal } from './InputModal'
import { ApprovalProvider, useApproval } from '@/hooks/useApproval'
import { invokeRequired } from '@/lib/tauri'
import type { ApprovalRequest } from '@/types/approval'
import en from '@/i18n/en.json'

// The global setup mock returns raw keys only; the countdown assertions need
// the seeded interpolation, so mirror i18next for that one key here.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { seconds?: number }) =>
      key === 'approval.countdown' ? `Auto-cancel in ${options?.seconds}s` : key,
    i18n: { changeLanguage: vi.fn(), language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

// The countdown tests drive the real provider; responses must not hit the wire.
vi.mock('@/lib/tauri', () => ({
  isTauri: () => false,
  invokeSafe: vi.fn(async () => null),
  invokeRequired: vi.fn(async () => undefined),
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Mounts InputModal inside the real provider, wired like ApprovalModal. */
function renderInputModal(request: ApprovalRequest) {
  const ModalHarness = () => {
    const { respond } = useApproval()
    return <InputModal request={request} onRespond={respond} />
  }
  return render(
    <ApprovalProvider sessionId="s1">
      <ModalHarness />
    </ApprovalProvider>,
  )
}

/** Feeds the request through the provider so a real deadline is scheduled. */
function dispatchRequestIntoProvider(request: ApprovalRequest) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent('omp:ui-request', {
        detail: {
          id: request.id,
          request: {
            method: request.method,
            title: request.title,
            options: request.options,
          },
        },
      }),
    )
  })
}

function inputRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'req-input-1',
    method: 'input',
    title: 'Enter your name',
    timestamp: 1,
    ...overrides,
  }
}

describe('InputModal countdown', () => {
  it('renders a countdown that decrements every second', () => {
    vi.useFakeTimers()
    const request = inputRequest()
    renderInputModal(request)
    dispatchRequestIntoProvider(request)

    expect(screen.getByTestId('approval-countdown')).toHaveTextContent(
      'Auto-cancel in 60s',
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByTestId('approval-countdown')).toHaveTextContent(
      'Auto-cancel in 59s',
    )
  })

  it('auto-cancels the request when the countdown reaches zero', async () => {
    vi.useFakeTimers()
    const request = inputRequest()
    renderInputModal(request)
    dispatchRequestIntoProvider(request)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    // LOCKED encoding: the timeout response is { cancelled: true }.
    expect(invokeRequired).toHaveBeenCalledWith('send_ui_response', {
      sessionId: 's1',
      requestId: request.id,
      response: { cancelled: true },
    })
    expect(screen.queryByTestId('approval-countdown')).toBeNull()
  })

  it('uses i18next double-brace interpolation in the real en.json countdown', () => {
    expect(en.approval.countdown).toContain('{{seconds}}')
  })
})
