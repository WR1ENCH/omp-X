import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Toast } from '@/types/approval'
import { createPortal } from 'react-dom'

interface ToastProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastProps) {
  const { t } = useTranslation()

  if (toasts.length === 0) return null

  const getIcon = (type: Toast['type']) => {
    switch (type) {
      case 'info':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        )
      case 'warning':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        )
      case 'error':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6" />
            <path d="M9 9l6 6" />
          </svg>
        )
    }
  }

  const getBgColor = (type: Toast['type']) => {
    switch (type) {
      case 'info':
        return 'bg-[var(--info-muted)] border-[var(--info)] text-[var(--info)]'
      case 'warning':
        return 'bg-[var(--warning-muted)] border-[var(--fg-warning)] text-[var(--fg-warning)]'
      case 'error':
        return 'bg-[var(--destructive-muted)] border-[var(--destructive)] text-[var(--destructive)]'
    }
  }

  return createPortal(
    <div
      className={cn(
        'fixed top-4 right-4 z-50 flex flex-col gap-2',
        'pointer-events-none'
      )}
      role="region"
      aria-label={t('toast.info')}
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg',
            'border min-w-[280px] max-w-[400px]',
            'pointer-events-auto animate-slide-in',
            getBgColor(toast.type)
          )}
          role="alert"
        >
          <div className="flex-shrink-0">{getIcon(toast.type)}</div>
          <div className="flex-1 text-sm">{toast.message}</div>
          <button
            onClick={() => onDismiss(toast.id)}
            className={cn(
              'flex-shrink-0 p-1 rounded',
              'hover:bg-black/10',
              'text-current opacity-70 hover:opacity-100'
            )}
            aria-label={t('common.close')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}