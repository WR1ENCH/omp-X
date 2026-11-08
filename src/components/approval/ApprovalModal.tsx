import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import type { ApprovalRequest } from '@/types/approval'
import { cn } from '@/lib/utils'
import { ModalShell } from './ModalShell'
import { InputModal } from './InputModal'
import { EditorTab } from './EditorTab'

/** Extra keys checked for the tool name before falling back to title parsing. */
const TOOL_EXTRA_KEYS = ['tool', 'toolName', 'name'] as const

/** Extra keys checked for the command before falling back to title parsing. */
const COMMAND_EXTRA_KEYS = ['command', 'cmd', 'shell_command', 'shell'] as const

function firstString(source: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

/** First title line carries the tool name: "Allow tool: bash" (blueprint §0). */
function parseTitleTool(title: string | undefined): string | undefined {
  const match = /^Allow tool:[ \t]*([^\r\n]+)/i.exec(title ?? '')
  return match?.[1]?.trim()
}

/** Everything after the "Command:" marker, newlines and args intact. */
function parseTitleCommand(title: string | undefined): string | undefined {
  if (!title) return undefined
  const marker = 'Command:'
  const index = title.indexOf(marker)
  if (index === -1) return undefined
  return title.slice(index + marker.length).replace(/^[ \t\r\n]+/, '')
}

/**
 * bash `select` requests carry the full command either in `extra` or embedded
 * in the title ("Allow tool: bash\nCommand: <cmd>"). The command must be shown
 * verbatim: never truncated, sanitized, or with args hidden.
 */
export function extractBashCommand(request: ApprovalRequest): string | undefined {
  if (request.method !== 'select') return undefined
  const extra = request.extra ?? {}
  const tool = firstString(extra, TOOL_EXTRA_KEYS) ?? parseTitleTool(request.title)
  if (tool?.toLowerCase() !== 'bash') return undefined
  return firstString(extra, COMMAND_EXTRA_KEYS) ?? parseTitleCommand(request.title)
}

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
  const bashCommand = extractBashCommand(request)
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
          {bashCommand !== undefined
            ? (request.title ?? '').split('\n')[0] || t('approval.select')
            : request.title || t(isSelect ? 'approval.select' : 'approval.confirm')}
        </h2>
      </div>

      {bashCommand !== undefined && (
        <div
          role="alert"
          className={cn(
            'flex items-start gap-2 border-b border-[var(--destructive)]',
            'bg-[var(--destructive-muted)] px-5 py-2.5 text-sm text-[var(--destructive)]',
          )}
        >
          <AlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          <span>{t('approval.bashWarning')}</span>
        </div>
      )}

      <div className="px-5 py-4">
        {bashCommand !== undefined && (
          <pre
            data-testid="approval-bash-command"
            className="mb-4 whitespace-pre-wrap break-all rounded-[var(--radius-md)] border border-[var(--destructive)] bg-[var(--destructive-muted)] px-3 py-2 font-mono text-sm text-[var(--fg-primary)]"
          >
            {bashCommand}
          </pre>
        )}
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
