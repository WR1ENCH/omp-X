import { useTranslation } from 'react-i18next'
import { ChevronLeft, Plus, MessageSquare, X } from 'lucide-react'
import { useLayoutState } from '@/hooks/useLayoutState'
import { cn } from '@/lib/utils'

interface SidebarProps {
  onResize?: (width: number) => void
  onSessionSelect?: (sessionId: string | null) => void
}

interface Session {
  id: string
  title: string
  updatedAt: number
  active: boolean
}

const MOCK_SESSIONS: Session[] = [
  { id: '1', title: 'Fix auth bug', updatedAt: Date.now() - 1000 * 60 * 5, active: true },
  { id: '2', title: 'Refactor dashboard', updatedAt: Date.now() - 1000 * 60 * 60 * 2, active: false },
  { id: '3', title: 'Add tests', updatedAt: Date.now() - 1000 * 60 * 60 * 24, active: false },
]

export function Sidebar({ onResize, onSessionSelect }: SidebarProps) {
  const { t } = useTranslation()
  const { railView, sidebarCollapsed, sidebarWidth, setSidebarWidth, toggleSidebar } = useLayoutState()

  const width = sidebarCollapsed ? 48 : sidebarWidth

  const renderContent = () => {
    switch (railView) {
      case 'sessions':
        return (
          <div className="flex flex-col h-full p-2 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-[var(--fg-primary)]">{t('sidebar.sessions.title')}</h3>
              <button
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--fg-secondary)] transition-colors"
                aria-label={t('sidebar.sessions.new')}
                title={t('sidebar.sessions.new')}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="space-y-1">
              {MOCK_SESSIONS.map((session) => (
                <button
                  key={session.id}
                  onClick={() => onSessionSelect?.(session.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm',
                    'transition-colors',
                    session.active
                      ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                      : 'hover:bg-[var(--bg-hover)] text-[var(--fg-secondary)]'
                  )}
                >
                  <MessageSquare size={14} />
                  <span className="flex-1 truncate">{session.title}</span>
                  {session.active && <X size={12} className="text-[var(--accent)] opacity-50" />}
                </button>
              ))}
            </div>
          </div>
        )
      case 'worktrees':
        return (
          <div className="flex flex-col h-full p-2 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-[var(--fg-primary)]">{t('sidebar.worktrees.title')}</h3>
              <button
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--fg-secondary)] transition-colors"
                aria-label={t('sidebar.worktrees.create')}
                title={t('sidebar.worktrees.create')}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="text-[var(--fg-muted)] text-sm text-center py-8">
              {t('sidebar.worktrees.empty')}
            </div>
          </div>
        )
      case 'agents':
        return (
          <div className="flex flex-col h-full p-2 overflow-y-auto">
            <h3 className="text-sm font-medium text-[var(--fg-primary)] mb-4">{t('sidebar.agents.title')}</h3>
            <div className="text-[var(--fg-muted)] text-sm text-center py-8">
              {t('sidebar.agents.empty')}
            </div>
          </div>
        )
      case 'tools':
        return (
          <div className="flex flex-col h-full p-2 overflow-y-auto">
            <h3 className="text-sm font-medium text-[var(--fg-primary)] mb-4">{t('sidebar.tools.title')}</h3>
            <div className="text-[var(--fg-muted)] text-sm text-center py-8">
              {t('sidebar.tools.empty')}
            </div>
          </div>
        )
      case 'settings':
        return (
          <div className="flex flex-col h-full p-2 overflow-y-auto">
            <h3 className="text-sm font-medium text-[var(--fg-primary)] mb-4">{t('sidebar.settings.title')}</h3>
            <nav className="space-y-1">
              {['general', 'appearance', 'keyboard', 'advanced'].map((key) => (
                <button
                  key={key}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-left text-sm',
                    'transition-colors',
                    'hover:bg-[var(--bg-hover)] text-[var(--fg-secondary)]'
                  )}
                >
                  {t(`sidebar.settings.${key}`)}
                </button>
              ))}
            </nav>
          </div>
        )
      case 'help':
        return (
          <div className="flex flex-col h-full p-2 overflow-y-auto">
            <h3 className="text-sm font-medium text-[var(--fg-primary)] mb-4">{t('sidebar.help.title')}</h3>
            <nav className="space-y-1">
              {['documentation', 'shortcuts', 'reportIssue', 'about'].map((key) => (
                <button
                  key={key}
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-left text-sm',
                    'transition-colors',
                    'hover:bg-[var(--bg-hover)] text-[var(--fg-secondary)]'
                  )}
                >
                  {t(`sidebar.help.${key}`)}
                </button>
              ))}
            </nav>
          </div>
        )
      case 'debug':
        return (
          <div className="flex flex-col h-full p-2 overflow-y-auto">
            <h3 className="text-sm font-medium text-[var(--fg-primary)] mb-4">{t('sidebar.debug.title')}</h3>
            <div className="space-y-2">
              <button className={cn('w-full px-3 py-2 rounded-lg text-left text-sm', 'bg-[var(--accent-muted)] text-[var(--accent)]')}>
                {t('sidebar.debug.logs')}
              </button>
              <button className={cn('w-full px-3 py-2 rounded-lg text-left text-sm', 'hover:bg-[var(--bg-hover)] text-[var(--fg-secondary)]')}>
                {t('sidebar.debug.inspect')}
              </button>
              <button className={cn('w-full px-3 py-2 rounded-lg text-left text-sm', 'hover:bg-[var(--bg-hover)] text-[var(--fg-secondary)]')}>
                {t('sidebar.debug.clear')}
              </button>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  if (sidebarCollapsed) {
    return (
      <aside
        className={cn(
          'flex flex-col items-center',
          'bg-[var(--bg-elevated)] border-r border-[var(--border)]',
          'transition-all duration-200',
          'fixed left-[48px] top-0 z-10 h-full',
          'overflow-hidden'
        )}
        style={{ width: '48px' }}
        aria-label={t('rail.sessions')}
      >
        <button
          onClick={toggleSidebar}
          className="mt-4 p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--fg-secondary)] transition-colors"
          aria-label={t('common.expand')}
          title={t('common.expand')}
        >
          <ChevronLeft size={16} />
        </button>
      </aside>
    )
  }

  return (
    <aside
      className={cn(
        'flex flex-col',
        'bg-[var(--bg-elevated)] border-r border-[var(--border)]',
        'transition-all duration-200',
        'fixed left-[48px] top-0 z-10 h-full',
        'overflow-hidden'
      )}
      style={{ width: `${width}px` }}
      aria-label={t('rail.sessions')}
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>
        <div
          className="w-1 cursor-col-resize bg-transparent hover:bg-[var(--accent-muted)] transition-colors"
          style={{ minWidth: '4px', maxWidth: '8px' }}
          onMouseDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startWidth = width
            const handleMove = (moveEvent: MouseEvent) => {
              const delta = moveEvent.clientX - startX
              const newWidth = Math.max(48, Math.min(480, startWidth + delta))
              setSidebarWidth(newWidth)
              onResize?.(newWidth)
            }
            const handleUp = () => {
              window.removeEventListener('mousemove', handleMove)
              window.removeEventListener('mouseup', handleUp)
            }
            window.addEventListener('mousemove', handleMove)
            window.addEventListener('mouseup', handleUp)
          }}
          aria-label="Resize sidebar"
          role="separator"
          tabIndex={0}
        />
      </div>
    </aside>
  )
}