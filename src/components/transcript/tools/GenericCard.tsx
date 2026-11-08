import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { DEFAULT_OUTPUT_LIMIT, formatToolArgs, formatToolResult, truncateOutput } from '@/lib/toolOutput'
import type { ToolBodyProps } from '../ToolCard'

export function GenericCard({ block, args, isError, openDockTab }: ToolBodyProps) {
  const { t } = useTranslation()
  const [showFull, setShowFull] = useState(false)
  const hasResult = block.result !== undefined
  const raw = formatToolResult(block.result, isError)
  const { text, truncated } = truncateOutput(raw, DEFAULT_OUTPUT_LIMIT)
  const visible = showFull ? raw : text

  return (
    <div className="space-y-2 px-3 pb-2">
      <div>
        <span className="text-xs text-[var(--fg-muted)]">{t('tool.arguments')}</span>
        <pre className="mt-1 overflow-x-auto bg-[var(--bg-base)] px-2 py-1 text-xs">
          <code className="text-[var(--fg-secondary)]">{formatToolArgs(args)}</code>
        </pre>
      </div>
      {hasResult && (
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
      )}
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
