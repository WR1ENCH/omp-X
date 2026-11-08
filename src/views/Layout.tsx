import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLayoutState } from '@/hooks/useLayoutState'
import { useSession } from '@/hooks/useSession'
import { ApprovalProvider, useApproval } from '@/hooks/useApproval'
import { Rail } from '@/components/Rail'
import { Sidebar } from '@/components/Sidebar'
import { ThreadWorkspace } from '@/components/ThreadWorkspace'
import { RightDock } from '@/components/RightDock'

interface ShellProps {
  activeSessionId: string | null
}

function Shell({ activeSessionId }: ShellProps) {
  const { t } = useTranslation()
  const { railWidth, sidebarWidth, dockWidth, ready } = useLayoutState()
  const { pendingRequests, respond } = useApproval()

  const editorRequest = Array.from(pendingRequests.values()).find(
    (request) => request.method === 'editor',
  )
  const editorRequestId = editorRequest?.id ?? null
  const editorValue =
    typeof editorRequest?.extra?.text === 'string' ? editorRequest.extra.text : ''

  const handleEditorSave = useCallback(
    (value: string) => {
      if (editorRequestId === null) return
      void respond(editorRequestId, value)
    },
    [editorRequestId, respond],
  )

  const handleEditorCancel = useCallback(() => {
    if (editorRequestId === null) return
    void respond(editorRequestId, null, true)
  }, [editorRequestId, respond])

  if (!ready) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[var(--bg-base)]">
        <div className="text-[var(--fg-muted)]">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div
      data-testid="layout-grid"
      className="h-full w-full overflow-hidden bg-[var(--bg-base)]"
      style={{
        display: 'grid',
        gridTemplateColumns: `${railWidth}px ${sidebarWidth}px 1fr ${dockWidth}px`,
        gridTemplateRows: 'minmax(0, 1fr)',
      }}
    >
      <Rail />
      <Sidebar />
      <ThreadWorkspace sessionId={activeSessionId} />
      <RightDock
        editorKey={editorRequestId ?? undefined}
        editorValue={editorValue}
        onEditorSave={handleEditorSave}
        onEditorCancel={handleEditorCancel}
      />
    </div>
  )
}

export function Layout() {
  const { activeSessionId } = useSession()

  return (
    <ApprovalProvider sessionId={activeSessionId}>
      <Shell activeSessionId={activeSessionId} />
    </ApprovalProvider>
  )
}
