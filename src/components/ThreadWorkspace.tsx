import { cn } from '@/lib/utils'
import { Transcript } from './transcript/Transcript'

interface ThreadWorkspaceProps {
  sessionId: string | null
}

export function ThreadWorkspace({ sessionId }: ThreadWorkspaceProps) {
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
      <Transcript sessionId={sessionId} />
    </main>
  )
}