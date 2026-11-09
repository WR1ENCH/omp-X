import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { AlertCircle, Edit3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/**
 * Prop contract shared with `RightDock` / `renderDockTab`.
 *
 * - `editorValue` is the text of the pending `editor` approval request. It is
 *   the *request* text, not the live draft: `RightDock` and `Layout` keep their
 *   own copy, so this only changes when a new request arrives. The tab keeps
 *   its own draft and resets it when `editorValue` changes. An empty string
 *   means no request is bound.
 * - `onEditorChange` fires on every keystroke so the parent can mirror the
 *   draft. Optional: the tab remains fully editable without it.
 * - `onEditorSave` receives the **edited text**, which the parent must forward
 *   as the `editor` method's response value.
 * - `onEditorCancel` signals a cancelled request; the parent responds with
 *   `{ cancelled: true }`.
 */
export interface EditorTabProps {
  editorValue?: string
  onEditorChange?: (value: string) => void
  onEditorSave?: (value: string) => void
  onEditorCancel?: () => void
  /** Accepted so the dock can pass one prop bag to every tab. */
  repoPath?: string
}

export function EditorTab({
  editorValue,
  onEditorChange,
  onEditorSave,
  onEditorCancel,
}: EditorTabProps) {
  const { t } = useTranslation()
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // Local draft: `editorValue` only tracks the request, not the user's typing.
  const [draft, setDraft] = useState(editorValue ?? '')
  const [lastRequestValue, setLastRequestValue] = useState(editorValue)

  // Reset the draft when a different request arrives. Adjusting state during
  // render is the React-documented way to react to a prop change, and it keeps
  // the textarea in sync even when the parent keeps its own copy of the text.
  if (editorValue !== lastRequestValue) {
    setLastRequestValue(editorValue)
    setDraft(editorValue ?? '')
  }

  const hasRequest = !!editorValue

  useEffect(() => {
    areaRef.current?.focus()
  }, [editorValue])

  const save = useCallback(() => {
    onEditorSave?.(draft)
  }, [draft, onEditorSave])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        save()
      }
    },
    [save]
  )

  if (!hasRequest) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-[var(--fg-muted)]">
        <Edit3 size={48} className="opacity-30" />
        <p className="text-sm">{t('dock.editor_group.empty')}</p>
        <p className="text-xs text-center max-w-xs">{t('dock.editor_group.emptyHint')}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-4 overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <Edit3 size={14} className="text-[var(--fg-muted)]" />
        <h3 className="text-sm font-medium text-[var(--fg-primary)]">{t('dock.editor_group.title')}</h3>
      </div>

      <textarea
        ref={areaRef}
        value={draft}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          onEditorChange?.(next)
        }}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        className={cn(
          'flex-1 px-3 py-2 rounded-lg font-mono text-sm resize-none',
          'bg-[var(--bg-base)] text-[var(--fg-primary)] border border-[var(--border)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--accent)]'
        )}
        aria-label={t('dock.editor_group.title')}
      />

      <p className="mt-2 text-xs text-[var(--fg-muted)]">{t('dock.editor_group.hint')}</p>

      <div className="flex justify-end gap-2 mt-3">
        <button
          type="button"
          onClick={() => onEditorCancel?.()}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium',
            'bg-[var(--bg-elevated)] text-[var(--fg-primary)] border border-[var(--border)]',
            'hover:bg-[var(--bg-hover)]'
          )}
        >
          {t('dock.editor_group.cancel')}
        </button>
        <button
          type="button"
          onClick={save}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
        >
          {t('dock.editor_group.save')}
        </button>
      </div>

      {!onEditorSave && (
        <p className="mt-2 flex items-center gap-1 text-xs text-[var(--fg-warning)]">
          <AlertCircle size={12} />
          {t('dock.editor_group.noHandler')}
        </p>
      )}
    </div>
  )
}
