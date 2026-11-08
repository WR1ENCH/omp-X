import { useTranslation } from 'react-i18next'
import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronRight, Maximize2, Minimize2, X, Edit3 } from 'lucide-react'
import { useLayoutState } from '@/hooks/useLayoutState'
import { DOCK_MAX_WIDTH, DOCK_MIN_WIDTH, DockTab } from '@/types/layout'
import { cn } from '@/lib/utils'
import { renderDockTab } from '@/components/dock/DockTabs'

const DOCK_TABS: { id: DockTab; icon: React.ReactNode; labelKey: string }[] = [
  { id: 'preview', icon: <Maximize2 size={16} />, labelKey: 'dock.preview' },
  { id: 'terminal', icon: <Minimize2 size={16} />, labelKey: 'dock.terminal' },
  { id: 'diff', icon: <X size={16} />, labelKey: 'dock.diff' },
  { id: 'worktree', icon: <ChevronRight size={16} />, labelKey: 'dock.worktree' },
  { id: 'editor', icon: <Edit3 size={16} />, labelKey: 'dock.editor' },
]

const RESIZE_STEP = 16

interface RightDockProps {
  onResize?: (width: number) => void
  /** Changes when a new editor request arrives; forces the editor textarea to remount. */
  editorKey?: string
  editorValue?: string
  onEditorChange?: (value: string) => void
  onEditorSave?: (value: string) => void
  onEditorCancel?: () => void
}

export function RightDock({
  onResize,
  editorKey,
  editorValue,
  onEditorChange,
  onEditorSave,
  onEditorCancel,
}: RightDockProps) {
  const { t } = useTranslation()
  const { state, dockWidth, setDockTab, setDockWidth, toggleDock } = useLayoutState()
  const { dockCollapsed, dockTab } = state
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartRef = useRef({ x: 0, width: dockWidth })
  const [editorDraft, setEditorDraft] = useState(editorValue ?? '')
  const [lastEditorValue, setLastEditorValue] = useState(editorValue)

  // Reset the draft when a different editor request arrives. This runs during
  // render so the textarea remount (keyed by editorKey) never shows stale text.
  if (editorValue !== lastEditorValue) {
    setLastEditorValue(editorValue)
    setEditorDraft(editorValue ?? '')
  }

  const width = dockCollapsed ? 0 : dockWidth

  const handleResizeMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      setIsResizing(true)
      resizeStartRef.current = { x: event.clientX, width: dockWidth }
    },
    [dockWidth],
  )

  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const delta = event.key === 'ArrowLeft' ? RESIZE_STEP : -RESIZE_STEP
      const next = Math.max(DOCK_MIN_WIDTH, Math.min(DOCK_MAX_WIDTH, dockWidth + delta))
      setDockWidth(next)
      onResize?.(next)
    },
    [dockWidth, setDockWidth, onResize],
  )

  useEffect(() => {
    if (!isResizing) return
    const handleMouseMove = (event: MouseEvent) => {
      const next = Math.max(
        DOCK_MIN_WIDTH,
        Math.min(DOCK_MAX_WIDTH, resizeStartRef.current.width + (resizeStartRef.current.x - event.clientX)),
      )
      setDockWidth(next)
      onResize?.(next)
    }
    const handleMouseUp = () => setIsResizing(false)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, setDockWidth, onResize])

  const handleEditorChange = useCallback(
    (value: string) => {
      setEditorDraft(value)
      onEditorChange?.(value)
    },
    [onEditorChange],
  )

  const handleEditorSave = useCallback(() => {
    onEditorSave?.(editorDraft)
  }, [editorDraft, onEditorSave])

  if (dockCollapsed) {
    return (
      <aside
        className={cn(
          'relative h-full flex flex-col',
          'bg-[var(--bg-base)] border-l border-[var(--border)]'
        )}
        style={{ width: 0 }}
        role="complementary"
        aria-label={t('dock.ariaLabel')}
      >
        <button
          onClick={toggleDock}
          className={cn(
            'absolute -left-10 top-1/2 -translate-y-1/2 w-10 h-10 rounded-l-lg',
            'bg-[var(--bg-elevated)] border border-[var(--border)] border-r-0',
            'flex items-center justify-center text-[var(--fg-secondary)]',
            'hover:text-[var(--fg-primary)] hover:bg-[var(--bg-hover)]',
            'transition-colors'
          )}
          aria-label={t('dock.expand')}
        >
          <ChevronRight size={16} />
        </button>
      </aside>
    )
  }

  return (
    <aside
      className={cn(
        'h-full flex bg-[var(--bg-base)] border-l border-[var(--border)]'
      )}
      style={{ width }}
      role="complementary"
      aria-label={t('dock.ariaLabel')}
    >
      <div
        className={cn(
          'w-1 h-full cursor-col-resize select-none touch-none shrink-0',
          'hover:bg-[var(--accent-muted)] focus:outline-none',
          'focus-visible:ring-2 focus-visible:ring-[var(--accent)]'
        )}
        onMouseDown={handleResizeMouseDown}
        onKeyDown={handleResizeKeyDown}
        aria-label={t('dock.resize')}
        aria-orientation="vertical"
        aria-valuenow={dockWidth}
        role="separator"
        tabIndex={0}
      >
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-px h-8 bg-[var(--border)]" />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between p-2 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-1" role="tablist" aria-label={t('dock.tabs')}>
            {DOCK_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setDockTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  'hover:bg-[var(--bg-hover)]',
                  dockTab === tab.id
                    ? 'bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20'
                    : 'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]'
                )}
                role="tab"
                aria-selected={dockTab === tab.id}
                aria-controls={`dock-panel-${tab.id}`}
                id={`dock-tab-${tab.id}`}
              >
                {tab.icon}
                <span>{t(tab.labelKey)}</span>
              </button>
            ))}
          </div>
          <button
            onClick={toggleDock}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
              'hover:bg-[var(--bg-hover)]'
            )}
            aria-label={t('dock.collapse')}
          >
            <X size={16} />
          </button>
        </div>

        {/*
          Every tab stays mounted; inactive panels are hidden. Unmounting the
          active tab on switch would run `useTerminal`'s cleanup (pty_kill) and
          kill the shell on every tab change.
        */}
        <div className="flex-1 flex flex-col min-h-0">
          {DOCK_TABS.map((tab) => {
            const active = dockTab === tab.id
            return (
              <div
                key={tab.id === 'editor' ? `editor-${editorKey ?? 'none'}` : tab.id}
                id={`dock-panel-${tab.id}`}
                role="tabpanel"
                aria-labelledby={`dock-tab-${tab.id}`}
                aria-hidden={!active}
                hidden={!active}
                className={cn('flex-1 overflow-hidden', !active && 'hidden')}
              >
                {renderDockTab(tab.id, {
                  editorValue,
                  onEditorChange: handleEditorChange,
                  onEditorSave: handleEditorSave,
                  onEditorCancel,
                })}
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
