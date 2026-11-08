import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { Transcript } from './transcript/Transcript'
import { Composer } from './composer/Composer'
import { ApprovalModal } from './approval/ApprovalModal'
import { ToastContainer } from './approval/Toast'
import { StatusBar } from './approval/StatusBar'
import { useApproval } from '@/hooks/useApproval'
import { TranscriptProvider } from '@/hooks/useTranscript'

interface ThreadWorkspaceProps {
  sessionId: string | null
}

export function ThreadWorkspace({ sessionId }: ThreadWorkspaceProps) {
  return (
    <TranscriptProvider sessionId={sessionId}>
      <Workspace sessionId={sessionId} />
    </TranscriptProvider>
  )
}

// The ApprovalProvider is mounted once by Layout (CONTRACT §5.4 "唯一实例"); this
// component only consumes the shared context, so dock editor and modal stay in sync.
function Workspace({ sessionId }: ThreadWorkspaceProps) {
  const { t } = useTranslation()
  const {
    pendingRequests,
    respond,
    toasts,
    dismissToast,
    statusItems,
    widgetItems,
    titleItem,
  } = useApproval()

  const currentRequest =
    pendingRequests.size > 0 ? (pendingRequests.values().next().value ?? null) : null

  return (
    <main
      className={cn(
        'flex flex-col',
        'bg-[var(--bg-base)]',
        'overflow-hidden',
        'relative'
      )}
      role="main"
    >
      <Transcript />
      <StatusBar statusItems={statusItems} widgetItems={widgetItems} titleItem={titleItem} />
      <Composer sessionId={sessionId} disabled={!!currentRequest} />
      {pendingRequests.size > 1 && (
        <div
          className={cn(
            'absolute top-2 left-1/2 -translate-x-1/2 z-40',
            'px-3 py-1 rounded-full text-xs',
            'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--fg-muted)]'
          )}
          role="status"
        >
          {t('approval.queued', { count: pendingRequests.size - 1 })}
        </div>
      )}
      {currentRequest && (
        <ApprovalModal
          key={currentRequest.id}
          request={currentRequest}
          onRespond={respond}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </main>
  )
}
