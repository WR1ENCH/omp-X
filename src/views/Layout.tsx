import { useLayoutState } from '@/hooks/useLayoutState'
import { Rail } from '@/components/Rail'
import { Sidebar } from '@/components/Sidebar'
import { ThreadWorkspace } from '@/components/ThreadWorkspace'
import { RightDock } from '@/components/RightDock'
import { cn } from '@/lib/utils'

export function Layout() {
  const { railWidth, sidebarWidth, dockWidth, ready } = useLayoutState()

  if (!ready) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[var(--bg-base)]">
        <div className="text-[var(--fg-muted)]">Loading layout...</div>
      </div>
    )
  }

  return (
    <div className={cn('relative h-full w-full overflow-hidden', 'bg-[var(--bg-base)]')}>
      <div
        className="absolute inset-0 z-0"
        style={{
          gridTemplateColumns: `${railWidth}px ${sidebarWidth}px 1fr ${dockWidth}px`,
        }}
      >
        <Rail />
        <Sidebar />
        <ThreadWorkspace />
        <RightDock />
      </div>
    </div>
  )
}