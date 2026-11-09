import { useTranslation } from 'react-i18next'
import { ChevronLeft, Plus, MessageSquare, X } from 'lucide-react'
import { useLayoutState } from '@/hooks/useLayoutState'
import { useSession } from '@/hooks/useSession'
import { sessionStore } from '@/lib/sessionStore'
import { cn } from '@/lib/utils'

interface SidebarProps {
  onResize?: (width: number) => void
  onSessionSelect?: (sessionId: string | null) => void
}

export function Sidebar({ onResize, onSessionSelect }: SidebarProps) {
  const { t } = useTranslation()
  const { state, sidebarWidth, setSidebarWidth, toggleSidebar } = useLayoutState()
  const {
    sessions,
    activeSessionId,
    ready,
    error,
    spawnSession,
    closeSession,
    selectSession,
  } = useSession()

  const railView = state.railView
  const width = sidebarWidth

  const handleSelectSession = (id: string) => {
    selectSession(id)
    onSessionSelect?.(id)
  }

  const handleNewSession = async () => {
    try {
      const id = await spawnSession()
      onSessionSelect?.(id)
    } catch (err) {
      console.error('[sidebar] spawn_session failed', err)
    }
  }

  const handleCloseSession = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation()
    try {
      const remaining = sessions.filter((session) => session.id !== id)
      if (remaining.length === 0) {
        // Keep at least one session so the workspace never goes blank.
        const newId = await spawnSession()
        onSessionSelect?.(newId)
        return
      }
      await closeSession(id)
      onSessionSelect?.(sessionStore.getState().activeSessionId)
    } catch (err) {
      console.error('[sidebar] close_session failed', err)
    }
  }

  const renderContent = () => {
    switch (railView) {
      case 'sessions':
        return (
          <div className="flex flex-col h-full p-2 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-[var(--fg-primary)]">{t('sidebar.sessions.title')}</h3>
              <button
                onClick={() => void handleNewSession()}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--fg-secondary)] transition-colors"
                aria-label={t('sidebar.sessions.new')}
                title={t('sidebar.sessions.new')}
              >
                <Plus size={16} />
              </button>
            </div>

            {!ready && (
              <div className="px-3 pb-2 text-xs text-[var(--fg-muted)]">{t('common.loading')}</div>
            )}
            {error && (
              <div role="alert" className="px-3 pb-2 text-xs text-[var(--fg-danger)]">
                {t('common.error')}: {error}
              </div>
            )}

            <div className="space-y-1">
              {sessions.length === 0 ? (
                <div className="text-[var(--fg-muted)] text-sm text-center py-8">
                  {t('sidebar.sessions.empty')}
                </div>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      'group w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                      'transition-colors',
                      session.id === activeSessionId
                        ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                        : 'hover:bg-[var(--bg-hover)] text-[var(--fg-secondary)]'
                    )}
                  >
                    <button
                      onClick={() => handleSelectSession(session.id)}
                      className="flex flex-1 min-w-0 items-center gap-2 text-left"
                      aria-current={session.id === activeSessionId ? 'true' : undefined}
                    >
                      <MessageSquare size={14} className="shrink-0" />
                      <span className="flex-1 min-w-0 truncate">{session.title}</span>
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          session.alive ? 'bg-[var(--accent)]' : 'bg-[var(--fg-muted)]'
                        )}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      onClick={(e) => void handleCloseSession(e, session.id)}
                      className={cn(
                        'shrink-0 p-0.5 rounded text-[var(--fg-muted)]',
                        'hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)]',
                        'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                      )}
                      aria-label={t('common.close')}
                      title={t('common.close')}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
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

  if (state.sidebarCollapsed) {
    return (
      <aside
        className={cn(
          'flex flex-col items-center',
          'bg-[var(--bg-elevated)] border-r border-[var(--border)]',
          'transition-all duration-200',
          'h-full',
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
        'h-full',
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
          aria-label={t('sidebar.resize')}
          role="separator"
          tabIndex={0}
        />
      </div>
    </aside>
  )
}