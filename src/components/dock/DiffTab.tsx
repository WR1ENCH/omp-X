import { useState, useMemo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  FileText,
  GitCompare,
  Loader2,
  Search,
  Minus,
  Plus,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useDiff, DiffHunk, DiffLine } from '@/hooks/useDiff'

function LineNumber({ number, className }: { number: number | null; className?: string }) {
  return (
    <span className={cn('w-10 text-right pr-2 text-xs select-none', 'text-[var(--fg-muted)]', className)}>
      {number !== null ? number : '—'}
    </span>
  )
}

function DiffLineComponent({ line }: { line: DiffLine }) {
  const backgroundColor =
    line.type === 'add' ? 'var(--diff-add-bg)' : line.type === 'remove' ? 'var(--diff-remove-bg)' : 'transparent'
  const textColor =
    line.type === 'add'
      ? 'var(--diff-add-fg)'
      : line.type === 'remove'
        ? 'var(--diff-remove-fg)'
        : 'var(--fg-primary)'

  return (
    <div
      className="flex font-mono text-xs"
      style={{ backgroundColor, color: textColor }}
    >
      <LineNumber number={line.oldLineNumber} className="border-r border-[var(--border)]" />
      <LineNumber number={line.newLineNumber} className="border-r border-[var(--border)]" />
      <span
        className={cn(
          'flex-1 px-2 py-0.5 whitespace-pre-wrap break-all',
          line.type === 'add' && 'text-[var(--diff-add-fg)]',
          line.type === 'remove' && 'text-[var(--diff-remove-fg)]'
        )}
      >
        {line.content || ' '}
      </span>
    </div>
  )
}

function DiffHunkComponent({ hunk }: { hunk: DiffHunk }) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)

  const added = hunk.lines.filter((l) => l.type === 'add').length
  const removed = hunk.lines.filter((l) => l.type === 'remove').length
  const visibleLines = collapsed ? hunk.lines.slice(0, 3) : hunk.lines

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-elevated)]">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={t('dock.diff_group.toggleHunk')}
        className={cn(
          'w-full px-3 py-2 flex items-center gap-2 text-left',
          'bg-[var(--bg-hover)] border-b border-[var(--border)]',
          'hover:bg-[var(--bg-hover)]/80'
        )}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <span className="font-mono text-xs text-[var(--fg-secondary)]">
          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
        </span>
        <span className="text-xs text-[var(--fg-muted)]">
          {added} {t('dock.diff_group.added')}, {removed} {t('dock.diff_group.removed')}
        </span>
        {collapsed && hunk.lines.length > 3 && (
          <span className="text-xs text-[var(--fg-muted)] ml-auto">
            {t('dock.diff_group.linesHidden', { count: hunk.lines.length - 3 })}
          </span>
        )}
      </button>
      <div className={cn('font-mono text-xs', collapsed && 'max-h-12 overflow-hidden')}>
        {visibleLines.map((line, i) => (
          <DiffLineComponent key={i} line={line} />
        ))}
      </div>
    </div>
  )
}

export function DiffTab() {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [compareOpen, setCompareOpen] = useState(false)
  const [oldDraft, setOldDraft] = useState('')
  const [newDraft, setNewDraft] = useState('')

  const diff = useDiff()

  const filteredHunks = useMemo(() => {
    if (!searchQuery.trim()) return diff.virtualizedHunks

    const query = searchQuery.toLowerCase()
    return diff.virtualizedHunks.filter((hunk) =>
      hunk.lines.some((line) => line.content.toLowerCase().includes(query))
    )
  }, [diff.virtualizedHunks, searchQuery])

  const stats = useMemo(() => {
    let added = 0
    let removed = 0
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'add') added++
        else if (line.type === 'remove') removed++
      }
    }
    return { added, removed, files: diff.hunks.length }
  }, [diff.hunks])

  const runComparison = () => {
    void diff.computeDiff(oldDraft, newDraft, t('dock.diff_group.compare'))
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)]">
      <div className="flex items-center gap-2 p-2 border-b border-[var(--border)] bg-[var(--bg-elevated)]">
        <FileText size={14} className="text-[var(--fg-muted)]" />
        <span className="text-xs font-medium text-[var(--fg-primary)]">
          {diff.filePath || t('dock.diff_group.noFile')}
        </span>

        <div className="flex-1" />

        <div className="flex items-center gap-2 text-xs text-[var(--fg-secondary)]">
          <span className="flex items-center gap-1">
            <Plus size={10} className="text-[var(--diff-add-fg)]" />
            {stats.added}
          </span>
          <span className="flex items-center gap-1">
            <Minus size={10} className="text-[var(--diff-remove-fg)]" />
            {stats.removed}
          </span>
          <span className="flex items-center gap-1">
            <FileText size={10} />
            {stats.files} {t('dock.diff_group.hunks')}
          </span>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--fg-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('dock.diff_group.searchPlaceholder')}
            className={cn(
              'w-48 pl-8 pr-2 py-1 text-xs rounded bg-[var(--bg-base)]',
              'text-[var(--fg-primary)] placeholder-[var(--fg-muted)]',
              'border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]'
            )}
            aria-label={t('dock.diff_group.search')}
          />
        </div>

        <button
          type="button"
          onClick={() => setCompareOpen((open) => !open)}
          className={cn(
            'p-1.5 rounded transition-colors',
            'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
            'hover:bg-[var(--bg-hover)]'
          )}
          title={t('dock.diff_group.compare')}
          aria-label={t('dock.diff_group.compare')}
          aria-expanded={compareOpen}
        >
          <GitCompare size={14} />
        </button>

        <button
          type="button"
          onClick={() => diff.clear()}
          className={cn(
            'p-1.5 rounded transition-colors',
            'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
            'hover:bg-[var(--bg-hover)]'
          )}
          title={t('dock.diff_group.clear')}
          aria-label={t('dock.diff_group.clear')}
        >
          <X size={14} />
        </button>
      </div>

      {compareOpen && (
        <div className="grid grid-cols-2 gap-2 border-b border-[var(--border)] bg-[var(--bg-elevated)] p-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--fg-muted)]">{t('dock.diff_group.oldContent')}</span>
            <textarea
              value={oldDraft}
              onChange={(event) => setOldDraft(event.target.value)}
              spellCheck={false}
              className={cn(
                'h-24 resize-y rounded border border-[var(--border)] bg-[var(--bg-base)] p-2',
                'font-mono text-xs text-[var(--fg-primary)] focus:border-[var(--accent)] focus:outline-none'
              )}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--fg-muted)]">{t('dock.diff_group.newContent')}</span>
            <textarea
              value={newDraft}
              onChange={(event) => setNewDraft(event.target.value)}
              spellCheck={false}
              className={cn(
                'h-24 resize-y rounded border border-[var(--border)] bg-[var(--bg-base)] p-2',
                'font-mono text-xs text-[var(--fg-primary)] focus:border-[var(--accent)] focus:outline-none'
              )}
            />
          </label>
          <button
            type="button"
            onClick={runComparison}
            disabled={diff.loading}
            className={cn(
              'col-span-2 rounded bg-[var(--accent)] py-1 text-xs text-white',
              'hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            {t('dock.diff_group.compareAction')}
          </button>
        </div>
      )}

      {diff.loading && (
        <div className="flex-1 flex items-center justify-center text-[var(--fg-muted)]">
          <Loader2 size={24} className="animate-spin" />
        </div>
      )}

      {diff.error && !diff.loading && (
        <div className="flex-1 flex items-center justify-center p-4 text-[var(--fg-danger)]">
          <div className="text-center">
            <FileText size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">{t('dock.diff_group.error')}</p>
            <p className="text-xs text-[var(--fg-muted)] mt-1">{diff.error}</p>
          </div>
        </div>
      )}

      {!diff.loading && !diff.error && diff.hunks.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-[var(--fg-muted)]">
          <FileText size={48} className="opacity-30" />
          <p className="text-sm">{t('dock.diff_group.emptyState')}</p>
          <p className="text-xs text-center max-w-xs">{t('dock.diff_group.emptyHint')}</p>
        </div>
      )}

      {!diff.loading && !diff.error && filteredHunks.length > 0 && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredHunks.map((hunk) => (
            <DiffHunkComponent key={hunk.id} hunk={hunk} />
          ))}
          {diff.hasMoreHunks && searchQuery.trim() === '' && (
            <button
              type="button"
              onClick={() => diff.showMoreHunks()}
              className="w-full rounded border border-[var(--border)] py-2 text-xs text-[var(--fg-secondary)] hover:bg-[var(--bg-hover)]"
            >
              {t('dock.diff_group.showMore', { count: diff.totalHunks - diff.virtualizedHunks.length })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
