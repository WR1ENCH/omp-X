import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface AttachmentButtonProps {
  onAttach: () => void
  disabled?: boolean
}

export function AttachmentButton({ onAttach, disabled }: AttachmentButtonProps) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={onAttach}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center w-10 h-10 rounded-lg',
        'bg-[var(--bg-elevated)] text-[var(--fg-primary)]',
        'border border-[var(--border)]',
        'hover:bg-[var(--bg-hover)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'transition-colors'
      )}
      aria-label={t('composer.attach')}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49" />
      </svg>
    </button>
  )
}