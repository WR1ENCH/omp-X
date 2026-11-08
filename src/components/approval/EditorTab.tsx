import { useId, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApprovalRequest } from '@/types/approval'
import { ModalShell } from './ModalShell'
import { readExtraString } from './readExtra'

interface EditorTabProps {
  request: ApprovalRequest
  onRespond: (id: string, value: unknown, cancelled?: boolean) => void
}

/**
 * Full-width `editor` approval surface. Multi-line by design: plain Enter
 * inserts a newline, Ctrl/Cmd+Enter saves. The text is controlled state.
 */
export function EditorTab({ request, onRespond }: EditorTabProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const [value, setValue] = useState(() =>
    readExtraString(request.extra, 'text', 'content', 'value', 'default'),
  )
  const [busy, setBusy] = useState(false)

  const label = request.title || t('approval.editor')

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

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void save()
    }
  }

  return (
    <ModalShell
      labelledBy={titleId}
      onCancel={cancel}
      lockMask
      className="p-0"
      dialogClassName="max-w-3xl"
    >
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-3">
        <h2 id={titleId} className="truncate font-mono text-sm text-[var(--fg-primary)]">
          {label}
        </h2>
        <div className="flex shrink-0 gap-2">
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
      </div>

      <textarea
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        aria-label={label}
        className="h-[60vh] w-full resize-none bg-[var(--bg-base)] p-5 font-mono text-sm leading-relaxed text-[var(--fg-primary)] outline-none"
      />

      <div className="border-t border-[var(--border)] px-5 py-2 text-xs text-[var(--fg-muted)]">
        {t('approval.editorHint')}
      </div>
    </ModalShell>
  )
}
