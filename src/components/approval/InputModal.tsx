import { useId, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApprovalRequest } from '@/types/approval'
import { ModalShell } from './ModalShell'
import { readExtraString } from './readExtra'

interface InputModalProps {
  request: ApprovalRequest
  onRespond: (id: string, value: unknown, cancelled?: boolean) => void
}

/**
 * Single-line `input` approval. The field is fully controlled — the response is
 * the state value, never a DOM query — and the raw string is sent back.
 */
export function InputModal({ request, onRespond }: InputModalProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const [value, setValue] = useState(() =>
    readExtraString(request.extra, 'default', 'value', 'text', 'content'),
  )
  const [busy, setBusy] = useState(false)

  const label = request.title || t('approval.input')
  const placeholder = readExtraString(request.extra, 'placeholder')

  const run = async (next: () => Promise<void> | void) => {
    if (busy) return
    setBusy(true)
    try {
      await next()
    } finally {
      setBusy(false)
    }
  }

  const save = () => run(() => onRespond(request.id, value))
  const cancel = () => run(() => onRespond(request.id, null, true))

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void save()
    }
  }

  return (
    <ModalShell labelledBy={titleId} onCancel={cancel}>
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 id={titleId} className="font-mono text-sm text-[var(--fg-primary)]">
          {label}
        </h2>
      </div>

      <div className="px-5 py-4">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={label}
          className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--fg-primary)] outline-none focus:border-[var(--accent)]"
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button
          type="button"
          data-cancel="true"
          onClick={cancel}
          disabled={busy}
          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--fg-inverse)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {t('common.save')}
        </button>
      </div>
    </ModalShell>
  )
}
