import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  GitBranch,
  Bot,
  Wrench,
  Settings,
  HelpCircle,
  Bug,
} from 'lucide-react'
import { useLayoutState } from '@/hooks/useLayoutState'
import { RailView } from '@/types/layout'
import { cn } from '@/lib/utils'

const RAIL_ITEMS: { id: RailView; icon: React.ReactNode; labelKey: string }[] = [
  { id: 'sessions', icon: <LayoutDashboard size={20} />, labelKey: 'rail.sessions' },
  { id: 'worktrees', icon: <GitBranch size={20} />, labelKey: 'rail.worktrees' },
  { id: 'agents', icon: <Bot size={20} />, labelKey: 'rail.agents' },
  { id: 'tools', icon: <Wrench size={20} />, labelKey: 'rail.tools' },
  { id: 'settings', icon: <Settings size={20} />, labelKey: 'rail.settings' },
  { id: 'help', icon: <HelpCircle size={20} />, labelKey: 'rail.help' },
  { id: 'debug', icon: <Bug size={20} />, labelKey: 'rail.debug' },
]

export function Rail() {
  const { t } = useTranslation()
  const { railView, setRailView } = useLayoutState()

  return (
    <nav
      className={cn(
        'flex flex-col items-center',
        'bg-[var(--bg-elevated)] border-r border-[var(--border)]',
        'transition-all duration-200',
        'w-[48px] h-full',
        'fixed left-0 top-0 z-10'
      )}
      style={{ width: 'var(--rail-width)' }}
      aria-label={t('rail.sessions')}
      role="navigation"
    >
      <div className="flex flex-col items-center h-full px-2 py-4 gap-1" role="toolbar">
        {RAIL_ITEMS.map(({ id, icon, labelKey }) => (
          <button
            key={id}
            onClick={() => setRailView(id)}
            className={cn(
              'flex items-center justify-center',
              'w-10 h-10 rounded-lg',
              'transition-colors duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
              railView === id
                ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)]'
            )}
            aria-label={t(labelKey)}
            aria-pressed={railView === id}
            role="tab"
            title={t(labelKey)}
          >
            {icon}
          </button>
        ))}
      </div>
    </nav>
  )
}