import { useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { SlashCommand } from '@/types/composer'

interface SlashMenuProps {
  commands: SlashCommand[]
  query: string
  onSelect: (command: SlashCommand) => void
  onClose: () => void
}

export function SlashMenu({ commands, query, onSelect, onClose }: SlashMenuProps) {
  const { t } = useTranslation()
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const filtered = commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase())
  )

  const [previousQuery, setPreviousQuery] = useState(query)
  if (query !== previousQuery) {
    setPreviousQuery(query)
    setHighlightedIndex(0)
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!menuRef.current?.contains(document.activeElement)) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filtered[highlightedIndex]) {
            onSelect(filtered[highlightedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [filtered, highlightedIndex, onSelect, onClose])

  useEffect(() => {
    itemRefs.current[highlightedIndex]?.focus()
  }, [highlightedIndex])

  if (filtered.length === 0) return null

  return (
    <div
      ref={menuRef}
      className={cn(
        'absolute bottom-full left-0 mb-1 w-[300px] max-h-[300px]',
        'bg-[var(--bg-elevated)] border border-[var(--border)]',
        'rounded-lg shadow-lg overflow-auto',
        'z-50'
      )}
      role="listbox"
      aria-label={t('composer.slashCommands')}
      tabIndex={-1}
    >
      {filtered.map((cmd, index) => (
        <button
          key={cmd.name}
          ref={(el) => (itemRefs.current[index] = el)}
          onClick={() => onSelect(cmd)}
          onMouseEnter={() => setHighlightedIndex(index)}
          role="option"
          aria-selected={index === highlightedIndex}
          className={cn(
            'w-full px-3 py-2 text-left text-sm',
            'hover:bg-[var(--bg-hover)]',
            index === highlightedIndex && 'bg-[var(--accent-muted)] text-[var(--accent)]'
          )}
        >
          <span className="font-mono text-[var(--accent)]">/{cmd.name}</span>
          <span className="ml-2 text-[var(--fg-muted)]">{cmd.description}</span>
          {cmd.category && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-[var(--bg-base)] rounded">
              {cmd.category}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}