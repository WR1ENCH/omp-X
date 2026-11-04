import { useTranslation } from 'react-i18next'
import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronRight, Maximize2, Minimize2, X } from 'lucide-react'
import { useLayoutState } from '@/hooks/useLayoutState'
import { DockTab } from '@/types/layout'
import { cn } from '@/lib/utils'

const DOCK_TABS: { id: DockTab; icon: React.ReactNode; labelKey: string }[] = [
  { id: 'preview', icon: <Maximize2 size={16} />, labelKey: 'dock.preview' },
  { id: 'terminal', icon: <Minimize2 size={16} />, labelKey: 'dock.terminal' },
  { id: 'diff', icon: <X size={16} />, labelKey: 'dock.diff' },
  { id: 'worktree', icon: <ChevronRight size={16} />, labelKey: 'dock.worktree' },
]

interface RightDockProps {
  onResize?: (width: number) => void
}

export function RightDock({ onResize }: RightDockProps) {
  const { t } = useTranslation()
  const { dockCollapsed, dockTab, dockWidth, setDockTab, setDockWidth, toggleDock } = useLayoutState()
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartRef = useRef({ x: 0, width: dockWidth })

  const width = dockCollapsed ? 0 : dockWidth

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    resizeStartRef.current = { x: e.clientX, width: dockWidth }
  }, [dockWidth])

  useEffect(() => {
    if (!isResizing) return

    const handleMove = (e: MouseEvent) => {
      const delta = resizeStartRef.current.x - e.clientX
      const newWidth = Math.max(280, Math.min(640, resizeStartRef.current.width + delta))
      setDockWidth(newWidth)
      onResize?.(newWidth)
    }

    const handleUp = () => {
      setIsResizing(false)
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isResizing, setDockWidth, onResize])

  if (dockCollapsed) {
    return (
      <aside
        className={cn(
          'flex flex-col items-center',
          'bg-[var(--bg-elevated)] border-l border-[var(--border)]',
          'transition-all duration-200',
          'fixed right-0 top-0 z-10 h-full',
          'overflow-hidden'
        )}
        style={{ width: '0px' }}
        aria-label={t('dock.preview')}
      >
        <button
          onClick={toggleDock}
          className="mt-4 ml-2 p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--fg-secondary)] transition-colors"
          aria-label={t('common.expand')}
          title={t('common.expand')}
        >
          <ChevronRight size={16} />
        </button>
      </aside>
    )
  }

  const renderTabContent = () => {
    switch (dockTab) {
      case 'preview':
        return (
          <div className="flex-1 p-4 overflow-y-auto">
            <h3 className="text-sm font-medium text-[var(--fg-primary)] mb-4">{t('dock.preview')}</h3>
            <div className="text-[var(--fg-muted)] text-sm text-center py-8">
              Preview content (Task 5+)
            </div>
          </div>
        )
      case 'terminal':
        return (
          <div className="flex-1 p-4 overflow-y-auto">
            <h3 className="text-sm font-medium text-[var(--fg-primary)] mb-4">{t('dock.terminal')}</h3>
            <div className="text-[var(--fg-muted)] text-sm text-center py-8">
              Terminal (Task 5+)
            </div>
          </div>
        )
      case 'diff':
        return (
          <div className="flex-1 p-4 overflow-y-auto">
            <h3 className="text-sm font-medium text-[var(--fg-primary)] mb-4">{t('dock.diff')}</h3>
            <div className="text-[var(--fg-muted)] text-sm text-center py-8">
              Diff viewer (Task 5+)
            </div>
          </div>
        )
      case 'worktree':
        return (
          <div className="flex-1 p-4 overflow-y-auto">
            <h3 className="text-sm font-medium text-[var(--fg-primary)] mb-4">{t('dock.worktree')}</h3>
            <div className="text-[var(--fg-muted)] text-sm text-center py-8">
              Worktree details (Task 5+)
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <aside
      className={cn(
        'flex flex-col',
        'bg-[var(--bg-elevated)] border-l border-[var(--border)]',
        'transition-all duration-200',
        'fixed right-0 top-0 z-10 h-full',
        'overflow-hidden'
      )}
      style={{ width: `${width}px` }}
      aria-label={t('dock.preview')}
    >
      <div className="flex flex-col h-full">
        <div
          className={cn(
            'w-1 cursor-col-resize bg-transparent hover:bg-[var(--accent-muted)] transition-colors',
            isResizing && 'bg-[var(--accent-muted)]'
          )}
          style={{ minWidth: '4px', maxWidth: '8px' }}
          onMouseDown={handleResizeMouseDown}
          aria-label="Resize dock"
          role="separator"
          tabIndex={0}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-1 flex-1" role="tablist" aria-label="Dock tabs">
              {DOCK_TABS.map(({ id, icon, labelKey }) => (
                <button
                  key={id}
                  onClick={() => setDockTab(id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm',
                    'transition-colors duration-150',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                    dockTab === id
                      ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                      : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)]'
                  )}
                  aria-label={t(labelKey)}
                  aria-selected={dockTab === id}
                  role="tab"
                  title={t(labelKey)}
                >
                  {icon}
                  <span className="hidden sm:inline">{t(labelKey)}</span>
                </button>
              ))}
            </div>
            <button
              onClick={toggleDock}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--fg-secondary)] transition-colors"
              aria-label={t('common.collapse')}
              title={t('common.collapse')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </aside>
  )
}