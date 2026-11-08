import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useComposer } from '@/hooks/useComposer'
import { ModelSelector } from './ModelSelector'
import { SlashMenu } from './SlashMenu'
import { AttachmentButton } from './AttachmentButton'

interface ComposerProps {
  sessionId: string | null
}

export function Composer({ sessionId }: ComposerProps) {
  const { t } = useTranslation()
  const {
    state,
    setState,
    isRunning,
    sendError,
    clearError,
    availableModels,
    availableCommands,
    sendPrompt,
    handleKeyDown,
    triggerSlash,
    selectSlashCommand,
    selectModel,
    attachFile,
    removeAttachment,
    stop,
    textareaRef,
  } = useComposer(sessionId)

  // Auto-grow the textarea with the content, capped by max-h-[200px].
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [textareaRef])

  useEffect(() => {
    adjustHeight()
  }, [state.value, adjustHeight])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setState((prev) => ({ ...prev, value }))

    const cursorPos = e.target.selectionStart
    const textBeforeCursor = value.slice(0, cursorPos)
    const lastChar = textBeforeCursor.slice(-1)
    const words = textBeforeCursor.split(/\s+/)
    const lastWord = words[words.length - 1]

    if (lastChar === '/' && lastWord === '/') {
      triggerSlash()
    } else if (state.showSlashMenu && lastWord.startsWith('/')) {
      setState((prev) => ({ ...prev, slashQuery: lastWord.slice(1) }))
    } else if (state.showSlashMenu) {
      setState((prev) => ({ ...prev, showSlashMenu: false }))
    }
  }

  const handleBlur = () => {
    setTimeout(() => {
      setState((prev) => ({ ...prev, showSlashMenu: false }))
    }, 100)
  }

  return (
    <div className={cn('flex flex-col', 'bg-[var(--bg-base)] border-t border-[var(--border)]')}>
      {state.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 py-1.5 border-b border-[var(--border)]">
          {state.attachments.map((att) => (
            <span
              key={att.id}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--bg-elevated)] text-sm',
                'border border-[var(--border)]'
              )}
            >
              {att.type === 'image' ? '🖼' : '📄'}
              <span className="truncate max-w-[150px]">{att.name}</span>
              <button
                onClick={() => removeAttachment(att.id)}
                className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                aria-label={t('composer.removeAttachment')}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {sendError && (
        <div
          role="alert"
          className="flex items-center gap-2 px-3 py-1.5 text-sm border-b border-[var(--border)] text-[var(--fg-danger)]"
        >
          <span className="flex-1 min-w-0 truncate">
            {t('composer.sendFailed')}: {sendError}
          </span>
          <button
            onClick={clearError}
            className="shrink-0 text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        <AttachmentButton onAttach={attachFile} disabled={isRunning} />

        <div className="flex-1 min-w-0 relative">
          <textarea
            ref={textareaRef}
            value={state.value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={t('composer.placeholder')}
            disabled={isRunning}
            className={cn(
              'w-full min-h-[44px] max-h-[200px] px-4 py-2.5 pr-12',
              'bg-[var(--bg-elevated)] text-[var(--fg-primary)]',
              'border border-[var(--border)] rounded-xl',
              'resize-none outline-none',
              'placeholder:text-[var(--fg-muted)]',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            rows={1}
            aria-label={t('composer.placeholder')}
          />
          {state.showSlashMenu && availableCommands.length > 0 && (
            <SlashMenu
              commands={availableCommands}
              query={state.slashQuery}
              onSelect={selectSlashCommand}
              onClose={() => setState((prev) => ({ ...prev, showSlashMenu: false }))}
            />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <ModelSelector
            models={availableModels}
            selected={state.modelId}
            onSelect={selectModel}
            disabled={isRunning}
          />

          {isRunning ? (
            <button
              onClick={stop}
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-lg',
                'bg-[var(--destructive-muted)] text-[var(--destructive)]',
                'hover:bg-[var(--destructive)] hover:text-white',
                'transition-colors'
              )}
              aria-label={t('composer.stop')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={sendPrompt}
              disabled={!state.value.trim()}
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-lg',
                'bg-[var(--accent)] text-white',
                'hover:bg-[var(--accent-hover)]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors'
              )}
              aria-label={t('composer.send')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}