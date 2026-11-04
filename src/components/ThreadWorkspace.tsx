import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export function ThreadWorkspace() {
  const { t } = useTranslation()

  return (
    <main
      className={cn(
        'flex flex-col',
        'bg-[var(--bg-base)]',
        'overflow-hidden',
        'relative'
      )}
      role="main"
      aria-label="Thread workspace"
    >
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="text-2xl font-medium text-[var(--fg-primary)] mb-2">
            {t('sidebar.sessions.title')} + {t('composer.placeholder')}
          </div>
          <div className="text-[var(--fg-muted)] text-sm">
            Transcript + Composer (Task 3/4)
          </div>
        </div>
      </div>
    </main>
  )
}