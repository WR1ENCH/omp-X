import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { DEFAULT_OUTPUT_LIMIT, extractResultText, truncateOutput } from '@/lib/toolOutput'
import type { ToolBodyProps } from '../ToolCard'

function pickPath(args: Record<string, unknown>): string {
  const value = args.file_path ?? args.filePath ?? args.path ?? args.file
  return typeof value === 'string' ? value : ''
}

export function FileCard({ block, args, isError, openDockTab }: ToolBodyProps) {
  const { t } = useTranslation()
  const [showFull, setShowFull] = useState(false)
  const filePath = pickPath(args)
  const raw = isError ? String(block.result ?? '') : extractResultText(block.result)
  const { text, truncated } = truncateOutput(raw, DEFAULT_OUTPUT_LIMIT)
  const visible = showFull ? raw : text
  const displayPath = filePath.length > 80 ? filePath.slice(0, 79) + '…' : filePath

  return (
    <div className="space-y-2 px-3 pb-2">
      <div>
        <span className="text-xs text-[var(--fg-muted)]">{t('tool.arguments')}</span>
        <div
          data-testid="tool-file-path"
          className="mt-1 overflow-x-auto bg-[var(--bg-base)] px-2 py-1 font-mono text-xs text-[var(--fg-secondary)]"
        >
          {displayPath}
        </div>
      </div>
      <div>
        <span className="text-xs text-[var(--fg-muted)]">{isError ? t('tool.error') : t('tool.result')}</span>
        <pre
          className={cn(
            'mt-1 overflow-x-auto whitespace-pre-wrap bg-[var(--bg-base)] px-2 py-1 text-xs',
            isError && 'text-red-500',
          )}
        >
          {visible}
        </pre>
      </div>
      {truncated && !showFull && (
        <button type="button" onClick={() => setShowFull(true)} className="text-xs text-[var(--accent)] hover:underline">
          {t('tool.viewMore')}
        </button>
      )}
      <button type="button" onClick={() => openDockTab('preview')} className="text-xs text-[var(--accent)] hover:underline">
        {t('tool.openFullOutput')}
      </button>
    </div>
  )
}
