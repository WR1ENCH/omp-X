import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApprovalRequest } from '@/types/approval'
import { ModalShell } from './ModalShell'
import { InputModal } from './InputModal'
import { EditorTab } from './EditorTab'

interface ApprovalModalProps {
  request: ApprovalRequest | null
  onRespond: (id: string, value: unknown, cancelled?: boolean) => void
}

/**
 * Renders the pending decision request. Each request id gets a fresh component
 * instance (key) so no state leaks between requests.
 */
export function ApprovalModal({ request, onRespond }: ApprovalModalProps) {
  if (!request) return null

  if (request.method === 'input') {
    return <InputModal key={request.id} request={request} onRespond={onRespond} />
  }
  if (request.method === 'editor') {
    return <EditorTab key={request.id} request={request} onRespond={onRespond} />
  }
  return <SelectOrConfirmModal key={request.id} request={request} onRespond={onRespond} />
}

interface SelectOrConfirmModalProps {
  request: ApprovalRequest
  onRespond: (id: string, value: unknown, cancelled?: boolean) => void
}

/**
 * `select` and `confirm` share the centered dialog. Select buttons answer with
 * the raw option string (never an i18n label); deny always answers
 * `{ cancelled: true }`.
 */
function SelectOrConfirmModal({ request, onRespond }: SelectOrConfirmModalProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const [busy, setBusy] = useState(false)

  const isSelect = request.method === 'select'
  const options = (request.options ?? []).filter(
    (option): option is string => typeof option === 'string' && option.length > 0,
  )

  const run = async (next: () => Promise<void> | void) => {
    if (busy) return
    setBusy(true)
    try {
      await next()
    } finally {
      setBusy(false)
    }
  }

  const respond = (value: unknown) => run(() => onRespond(request.id, value))
  const cancel = () => run(() => onRespond(request.id, null, true))

  return (
    <ModalShell labelledBy={titleId} onCancel={cancel}>
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 id={titleId} className="font-mono text-sm text-[var(--fg-primary)]">
          {request.title || t(isSelect ? 'approval.select' : 'approval.confirm')}
        </h2>
      </div>

      <div className="px-5 py-4">
        {isSelect ? (
          options.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {options.map((option) => (
                <li key={option}>
                  <button
                    type="button"
                    onClick={() => respond(option)}
                    disabled={busy}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-left font-mono text-sm text-[var(--fg-primary)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
                  >
                    {option}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--fg-secondary)]">{t('approval.noOptions')}</p>
          )
        ) : (
          <p className="text-sm text-[var(--fg-secondary)]">{t('approval.confirmPrompt')}</p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button
          type="button"
          data-cancel="true"
          onClick={cancel}
          disabled={busy}
          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
        >
          {t('approval.deny')}
        </button>
        {!isSelect && (
          <button
            type="button"
            onClick={() => respond(true)}
            disabled={busy}
            className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--fg-inverse)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {t('approval.approve')}
          </button>
        )}
      </div>
    </ModalShell>
  )
}
