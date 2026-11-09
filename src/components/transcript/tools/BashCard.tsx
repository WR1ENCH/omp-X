import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { DEFAULT_OUTPUT_LIMIT, extractFilePaths, extractResultText, truncateOutput } from '@/lib/toolOutput'
import type { DockTab } from '@/types/layout'
import type { ToolBodyProps } from '../ToolCard'

interface PathPart {
  path: string
}

function linkifyParts(text: string, paths: string[]): Array<string | PathPart> {
  const sorted = [...paths].sort((a, b) => b.length - a.length)
  const parts: Array<string | PathPart> = []
  let rest = text
  while (rest.length > 0) {
    let earliest = -1
    let earliestPath = ''
    for (const candidate of sorted) {
      const at = rest.indexOf(candidate)
      if (at !== -1 && (earliest === -1 || at < earliest)) {
        earliest = at
        earliestPath = candidate
      }
    }
    if (earliest === -1) {
      parts.push(rest)
      break
    }
    if (earliest > 0) {
      parts.push(rest.slice(0, earliest))
    }
    parts.push({ path: earliestPath })
    rest = rest.slice(earliest + earliestPath.length)
  }
  return parts
}

function OutputWithPaths({ text, openDockTab }: { text: string; openDockTab: (tab: DockTab) => void }) {
  const parts = linkifyParts(text, extractFilePaths(text))
  return (
    <>
      {parts.map((part, index) =>
        typeof part === 'string' ? (
          <span key={index}>{part}</span>
        ) : (
          <button
            key={index}
            type="button"
            className="rounded px-0.5 underline decoration-dotted hover:bg-[var(--bg-hover)]"
            onClick={() => openDockTab(/:\d+(:\d+)?$/.test(part.path) ? 'diff' : 'preview')}
          >
            {part.path}
          </button>
        ),
      )}
    </>
  )
}

export function BashCard({ block, args, isError, openDockTab }: ToolBodyProps) {
  const { t } = useTranslation()
  const [showFull, setShowFull] = useState(false)
  const [copied, setCopied] = useState(false)
  const command = typeof args.command === 'string' ? args.command : ''
  const raw = isError ? String(block.result ?? '') : extractResultText(block.result)
  const { text, truncated } = truncateOutput(raw, DEFAULT_OUTPUT_LIMIT)
  const visible = showFull ? raw : text

  const copy = () => {
    const clipboard = navigator.clipboard
    if (clipboard && typeof clipboard.writeText === 'function') {
      clipboard.writeText(raw).catch(() => undefined)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div className="space-y-2 px-3 pb-2">
      <div>
        <span className="text-xs text-[var(--fg-muted)]">{t('tool.arguments')}</span>
        <pre data-testid="tool-command" className="mt-1 overflow-x-auto bg-[var(--bg-base)] px-2 py-1 text-xs">
          <code className="text-[var(--fg-secondary)]">{command}</code>
        </pre>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={copy} className="text-xs text-[var(--accent)] hover:underline">
          {copied ? t('tool.copied') : t('tool.copy')}
        </button>
      </div>
      <div>
        <span className="text-xs text-[var(--fg-muted)]">{isError ? t('tool.error') : t('tool.result')}</span>
        <pre
          data-testid="tool-output"
          className={cn(
            'mt-1 overflow-x-auto whitespace-pre-wrap bg-[var(--bg-base)] px-2 py-1 text-xs',
            isError && 'text-red-500',
          )}
        >
          <OutputWithPaths text={visible} openDockTab={openDockTab} />
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
