import { useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { ModelInfo } from '@/types/composer'

interface ModelSelectorProps {
  models: ModelInfo[]
  selected: string | null
  onSelect: (modelId: string) => void
  disabled?: boolean
}

export function ModelSelector({ models, selected, onSelect, disabled }: ModelSelectorProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (buttonRef.current?.contains(e.target as Node)) return
      if (menuRef.current?.contains(e.target as Node)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentModel = models.find((m) => m.id === selected)

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={buttonRef}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || models.length === 0}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
          'bg-[var(--bg-elevated)] text-[var(--fg-primary)]',
          'border border-[var(--border)]',
          'hover:bg-[var(--bg-hover)]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-colors text-sm font-medium'
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t('composer.model')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
        <span className="truncate max-w-[120px]">
          {currentModel?.name || t('composer.model')}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isOpen && models.length > 0 && (
        <div
          className={cn(
            'absolute bottom-full left-0 mb-2 w-[200px]',
            'bg-[var(--bg-elevated)] border border-[var(--border)]',
            'rounded-lg shadow-lg overflow-hidden',
            'z-50'
          )}
          role="listbox"
          aria-label={t('composer.model')}
        >
          {models.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                onSelect(model.id)
                setIsOpen(false)
              }}
              role="option"
              aria-selected={selected === model.id}
              className={cn(
                'w-full px-3 py-2 text-left text-sm',
                'hover:bg-[var(--bg-hover)]',
                selected === model.id && 'bg-[var(--accent-muted)] text-[var(--accent)]'
              )}
            >
              {model.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}