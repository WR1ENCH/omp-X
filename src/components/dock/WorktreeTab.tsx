import { useState, useCallback, FormEvent } from 'react'
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FolderGit2,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useWorktree, WorktreeInfo } from '@/hooks/useWorktree'
import { useSession } from '@/hooks/useSession'

function WorktreeItem({
  worktree,
  isMain,
  onRemove,
  onCopyPath,
  selected,
  onSelect,
}: {
  worktree: WorktreeInfo
  isMain: boolean
  onRemove: (path: string) => void
  onCopyPath: (path: string) => void
  selected: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [removing, setRemoving] = useState(false)

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await onRemove(worktree.path)
    } finally {
      setRemoving(false)
    }
  }

  const shortCommit = worktree.commit ? worktree.commit.slice(0, 8) : ''
  const label = worktree.branch || worktree.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || worktree.path

  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative rounded-lg border transition-colors cursor-pointer',
        'bg-[var(--bg-elevated)] border-[var(--border)]',
        'hover:border-[var(--accent)]/50',
        selected && 'border-[var(--accent)] bg-[var(--accent)]/5'
      )}
    >
      <div className="p-3 flex items-start gap-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          <FolderGit2 size={18} className={cn('text-[var(--fg-secondary)]', isMain && 'text-[var(--accent)]')} />
          {isMain && <CheckCircle size={12} className="text-[var(--accent)]" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('font-mono text-sm font-medium truncate', isMain && 'text-[var(--accent)]')}>
              {label}
            </span>
            {worktree.detached && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-[var(--fg-muted)]/10 text-[var(--fg-muted)]">
                {t('dock.worktree_group.detached')}
              </span>
            )}
            {worktree.bare && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-[var(--fg-muted)]/10 text-[var(--fg-muted)]">
                {t('dock.worktree_group.bare')}
              </span>
            )}
            {worktree.locked && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-[var(--fg-danger)]/10 text-[var(--fg-danger)]">
                {t('dock.worktree_group.locked')}
              </span>
            )}
            {worktree.prunable && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-[var(--fg-warning)]/10 text-[var(--fg-warning)]">
                {t('dock.worktree_group.prunable')}
              </span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-3 text-xs text-[var(--fg-muted)]">
            <span className="font-mono truncate flex-1" title={worktree.path}>
              {worktree.path}
            </span>
            {shortCommit && <span className="font-mono">{shortCommit}</span>}
          </div>

          {expanded && (
            <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onCopyPath(worktree.path)
                }}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded',
                  'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
                  'hover:bg-[var(--bg-hover)]'
                )}
              >
                <Copy size={12} />
                {t('dock.worktree_group.copyPath')}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  window.open(`file://${worktree.path}`, '_blank')
                }}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded',
                  'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
                  'hover:bg-[var(--bg-hover)]'
                )}
              >
                <ExternalLink size={12} />
                {t('dock.worktree_group.openFolder')}
              </button>
              {!isMain && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleRemove()
                  }}
                  disabled={removing}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded ml-auto',
                    'text-[var(--fg-danger)] hover:text-[var(--fg-danger)]',
                    'hover:bg-[var(--fg-danger)]/10 disabled:opacity-50'
                  )}
                >
                  <Trash2 size={12} />
                  {removing ? t('dock.worktree_group.removing') : t('dock.worktree_group.remove')}
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(!expanded)
          }}
          className={cn('p-1 text-[var(--fg-muted)] hover:text-[var(--fg-primary)]', expanded && 'rotate-180')}
          aria-label={t('dock.worktree_group.title')}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>
    </div>
  )
}

function CreateWorktreeForm({
  onCreate,
  onCancel,
  loading,
}: {
  onCreate: (path: string, branch: string, baseBranch?: string) => Promise<boolean>
  onCancel: () => void
  loading: boolean
}) {
  const { t } = useTranslation()
  const [path, setPath] = useState('')
  const [branch, setBranch] = useState('')
  const [baseBranch, setBaseBranch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!path.trim() || !branch.trim()) {
      setError(t('dock.worktree_group.requiredFields'))
      return
    }

    const ok = await onCreate(path.trim(), branch.trim(), baseBranch.trim() || undefined)
    if (!ok) setError(t('dock.worktree_group.error'))
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-3 space-y-3 border border-[var(--border)] rounded-lg bg-[var(--bg-elevated)]"
    >
      <h4 className="text-sm font-medium text-[var(--fg-primary)]">{t('dock.worktree_group.createNew')}</h4>

      <div>
        <label className="block text-xs text-[var(--fg-secondary)] mb-1">
          {t('dock.worktree_group.path')}
        </label>
        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder={t('dock.worktree_group.pathPlaceholder')}
          className={cn(
            'w-full px-2 py-1.5 text-sm rounded bg-[var(--bg-base)]',
            'text-[var(--fg-primary)] placeholder-[var(--fg-muted)]',
            'border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]'
          )}
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-xs text-[var(--fg-secondary)] mb-1">
          {t('dock.worktree_group.branch')}
        </label>
        <input
          type="text"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder={t('dock.worktree_group.branchPlaceholder')}
          className={cn(
            'w-full px-2 py-1.5 text-sm rounded bg-[var(--bg-base)]',
            'text-[var(--fg-primary)] placeholder-[var(--fg-muted)]',
            'border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]'
          )}
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-xs text-[var(--fg-secondary)] mb-1">
          {t('dock.worktree_group.baseBranch')}
        </label>
        <input
          type="text"
          value={baseBranch}
          onChange={(e) => setBaseBranch(e.target.value)}
          placeholder={t('dock.worktree_group.baseBranchPlaceholder')}
          className={cn(
            'w-full px-2 py-1.5 text-sm rounded bg-[var(--bg-base)]',
            'text-[var(--fg-primary)] placeholder-[var(--fg-muted)]',
            'border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]'
          )}
          disabled={loading}
        />
      </div>

      {error && (
        <p className="text-xs text-[var(--fg-danger)]" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            'px-3 py-1.5 text-sm rounded transition-colors',
            'bg-[var(--bg-base)] text-[var(--fg-primary)] border border-[var(--border)] hover:bg-[var(--bg-hover)]'
          )}
          disabled={loading}
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          className={cn(
            'px-3 py-1.5 text-sm rounded transition-colors',
            'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50'
          )}
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" />
              {t('dock.worktree_group.creating')}
            </span>
          ) : (
            t('dock.worktree_group.create')
          )}
        </button>
      </div>
    </form>
  )
}

type ConfirmState = { kind: 'remove'; path: string } | { kind: 'prune' } | null

export function WorktreeTab({ repoPath }: { repoPath?: string }) {
  const { t } = useTranslation()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)

  // Fall back to the active session's working directory so the tab is usable
  // without RightDock threading a repoPath prop through.
  const session = useSession()
  const activeCwd = session.activeSession?.cwd
  const resolvedRepoPath = repoPath?.trim() || activeCwd || undefined

  const worktree = useWorktree(resolvedRepoPath)

  const handleCreate = useCallback(
    async (path: string, branch: string, baseBranch?: string) => {
      const ok = await worktree.create(path, branch, baseBranch)
      if (ok) setShowCreateForm(false)
      return ok
    },
    [worktree]
  )

  const handleRemove = useCallback(
    async (path: string, force = false) => {
      await worktree.remove(path, force)
      if (selectedPath === path) setSelectedPath(null)
    },
    [worktree, selectedPath]
  )

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).catch((err) => {
      console.error('[worktree] copy path failed', err)
    })
  }, [])

  const confirmRemove = confirm?.kind === 'remove' ? confirm : null
  const confirmPrune = confirm?.kind === 'prune' ? confirm : null

  return (
    <div className="relative flex flex-col h-full bg-[var(--bg-base)]">
      <div className="flex items-center justify-between p-2 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
        <div className="flex items-center gap-2 min-w-0">
          <FolderGit2 size={14} className="text-[var(--fg-muted)] shrink-0" />
          <span className="text-xs font-medium text-[var(--fg-primary)]">
            {t('dock.worktree_group.title')}
          </span>
          <span className="text-xs text-[var(--fg-muted)]">({worktree.worktrees.length})</span>
          {resolvedRepoPath && (
            <span className="truncate font-mono text-xs text-[var(--fg-muted)]" title={resolvedRepoPath}>
              {resolvedRepoPath}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void worktree.refresh()}
            disabled={worktree.loading}
            className={cn(
              'p-1.5 rounded transition-colors',
              'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
              'hover:bg-[var(--bg-hover)] disabled:opacity-50'
            )}
            title={t('dock.worktree_group.refresh')}
            aria-label={t('dock.worktree_group.refresh')}
          >
            <Loader2 size={14} className={worktree.loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setConfirm({ kind: 'prune' })}
            disabled={worktree.loading || !resolvedRepoPath}
            className={cn(
              'p-1.5 rounded transition-colors',
              'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
              'hover:bg-[var(--bg-hover)] disabled:opacity-50'
            )}
            title={t('dock.worktree_group.prune')}
            aria-label={t('dock.worktree_group.prune')}
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            disabled={!resolvedRepoPath}
            className={cn(
              'px-2 py-1.5 text-xs rounded transition-colors',
              'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50'
            )}
          >
            <Plus size={12} className="inline-block mr-1" />
            {t('dock.worktree_group.add')}
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="p-3 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
          <CreateWorktreeForm
            onCreate={handleCreate}
            onCancel={() => setShowCreateForm(false)}
            loading={worktree.creating}
          />
        </div>
      )}

      {worktree.loading && (
        <div className="flex-1 flex items-center justify-center text-[var(--fg-muted)]">
          <Loader2 size={24} className="animate-spin" />
        </div>
      )}

      {worktree.error && !worktree.loading && (
        <div className="p-3 text-center text-[var(--fg-danger)]">
          <AlertCircle size={24} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium">
            {resolvedRepoPath ? t('dock.worktree_group.error') : t('dock.worktree_group.noRepo')}
          </p>
          <p className="text-xs text-[var(--fg-muted)] mt-1">
            {resolvedRepoPath ? worktree.error : t('dock.worktree_group.noRepoHint')}
          </p>
          <button
            type="button"
            onClick={() => void worktree.refresh()}
            className="mt-2 px-3 py-1 text-xs rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            {t('dock.worktree_group.retry')}
          </button>
        </div>
      )}

      {!worktree.loading && !worktree.error && worktree.worktrees.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-[var(--fg-muted)]">
          <FolderGit2 size={48} className="opacity-30" />
          <p className="text-sm">{t('dock.worktree_group.emptyState')}</p>
          <p className="text-xs text-center max-w-xs">{t('dock.worktree_group.emptyHint')}</p>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="mt-2 px-4 py-2 text-sm rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            <Plus size={14} className="inline-block mr-1" />
            {t('dock.worktree_group.createFirst')}
          </button>
        </div>
      )}

      {!worktree.loading && !worktree.error && worktree.worktrees.length > 0 && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {worktree.worktrees.map((wt) => (
            <WorktreeItem
              key={wt.path}
              worktree={wt}
              isMain={resolvedRepoPath != null && wt.path === resolvedRepoPath}
              onRemove={(path) => setConfirm({ kind: 'remove', path })}
              onCopyPath={handleCopyPath}
              selected={selectedPath === wt.path}
              onSelect={() => setSelectedPath(wt.path)}
            />
          ))}
        </div>
      )}

      {(confirmRemove || confirmPrune) && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={confirmRemove ? t('dock.worktree_group.confirmRemoveTitle') : t('dock.worktree_group.confirmPruneTitle')}
          onClick={() => setConfirm(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-[var(--fg-primary)]">
              {confirmRemove
                ? t('dock.worktree_group.confirmRemoveTitle')
                : t('dock.worktree_group.confirmPruneTitle')}
            </h3>
            <p className="mt-2 text-xs text-[var(--fg-secondary)]">
              {confirmRemove
                ? t('dock.worktree_group.confirmRemoveBody', { path: confirmRemove.path })
                : t('dock.worktree_group.confirmPruneBody')}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--fg-primary)] hover:bg-[var(--bg-hover)]"
              >
                {t('dock.worktree_group.cancelRemove')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmRemove) void handleRemove(confirmRemove.path, true)
                  else void worktree.prune()
                  setConfirm(null)
                }}
                className="rounded bg-[var(--fg-danger)] px-3 py-1.5 text-xs text-white hover:opacity-90"
              >
                {confirmRemove
                  ? t('dock.worktree_group.confirmRemove')
                  : t('dock.worktree_group.confirmPrune')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
