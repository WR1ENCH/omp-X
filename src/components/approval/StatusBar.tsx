import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { StatusItem, WidgetItem } from '@/types/approval'

interface StatusBarProps {
  statusItems: StatusItem[]
  widgetItems: WidgetItem[]
  titleItem: string | null
}

export function StatusBar({ statusItems, widgetItems, titleItem }: StatusBarProps) {
  const { t } = useTranslation()

  // `setTitle` drives both the inline status bar and the window title.
  useEffect(() => {
    document.title = titleItem ? `${titleItem} · ${t('app.title')}` : t('app.title')
  }, [titleItem, t])

  const hasContent = statusItems.length > 0 || widgetItems.length > 0 || titleItem !== null

  if (!hasContent) return null

  return (
    <div
      className={cn(
        'flex items-center gap-4 px-3 py-1.5',
        'bg-[var(--bg-base)] border-t border-[var(--border)]',
        'text-xs font-mono'
      )}
      role="status"
      aria-label={t('status.bar')}
    >
      {titleItem && (
        <div className={cn('flex items-center gap-2', 'text-[var(--fg-primary)] font-medium')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          {titleItem}
        </div>
      )}

      {statusItems.map((item) => (
        <div key={item.key} className={cn('flex items-center gap-1.5', 'text-[var(--fg-secondary)]')}>
          <span className="text-[var(--fg-muted)]">{item.key}:</span>
          <span>{item.text}</span>
        </div>
      ))}

      {widgetItems.map((widget) => (
        <div key={widget.widgetKey} className={cn('flex items-center gap-1.5', 'text-[var(--fg-secondary)]')}>
          <span className="text-[var(--fg-muted)]">{widget.widgetKey}:</span>
          <span>{widget.lines.join(' | ')}</span>
        </div>
      ))}
    </div>
  )
}
