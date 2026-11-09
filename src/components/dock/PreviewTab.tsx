import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe,
  Loader2,
  RotateCw,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { usePreview } from '@/hooks/usePreview'
export function PreviewTab() {
  const { t } = useTranslation()
  const preview = usePreview()
  const {
    url,
    loading,
    error,
    canGoBack,
    canGoForward,
    isTauri,
    windowOpen,
    iframeRef,
    navigate,
    goBack,
    goForward,
    reload,
    close,
  } = preview

  const inputRef = useRef<HTMLInputElement>(null)
  const [frameLoading, setFrameLoading] = useState(false)

  // A failed navigation leaves `frameLoading` set; the error banner takes over.
  const busy = loading || (frameLoading && !error)

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const raw = inputRef.current?.value ?? url
    if (!isTauri) setFrameLoading(true)
    // `navigate` validates the URL and publishes the invalid-URL error state.
    await navigate(raw)
  }

  const showClosedState = isTauri && !windowOpen && !loading

  return (
    <div className="flex h-full flex-col bg-[var(--bg-base)]">
      <form onSubmit={submit} className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-elevated)] p-2">
        <button
          type="button"
          onClick={() => void goBack()}
          disabled={!canGoBack}
          className={cn(
            'rounded p-1.5 transition-colors',
            'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
            'hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40'
          )}
          title={t('dock.preview_group.back')}
          aria-label={t('dock.preview_group.back')}
        >
          <ArrowLeft size={14} />
        </button>

        <button
          type="button"
          onClick={() => void goForward()}
          disabled={!canGoForward}
          className={cn(
            'rounded p-1.5 transition-colors',
            'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
            'hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40'
          )}
          title={t('dock.preview_group.forward')}
          aria-label={t('dock.preview_group.forward')}
        >
          <ArrowRight size={14} />
        </button>

        <button
          type="button"
          onClick={() => void reload()}
          disabled={busy || !url}
          className={cn(
            'rounded p-1.5 transition-colors',
            'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
            'hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40'
          )}
          title={t('dock.preview_group.reload')}
          aria-label={t('dock.preview_group.reload')}
        >
          <RotateCw size={14} className={cn(busy && 'animate-spin')} />
        </button>

        <div className="relative min-w-0 flex-1">
          <Globe
            size={12}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--fg-muted)]"
          />
          <input
            key={url}
            ref={inputRef}
            type="text"
            defaultValue={url}
            placeholder={t('dock.preview_group.placeholder')}
            aria-label={t('dock.preview_group.url')}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className={cn(
              'w-full rounded border border-[var(--border)] bg-[var(--bg-base)]',
              'py-1 pl-7 pr-2 text-xs text-[var(--fg-primary)]',
              'placeholder:text-[var(--fg-muted)] focus:border-[var(--accent)] focus:outline-none'
            )}
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className={cn(
            'rounded bg-[var(--accent)] px-2.5 py-1 text-xs text-white',
            'hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {t('dock.preview_group.go')}
        </button>

        <button
          type="button"
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          disabled={!url}
          className={cn(
            'rounded p-1.5 transition-colors',
            'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
            'hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40'
          )}
          title={t('dock.preview_group.openExternal')}
          aria-label={t('dock.preview_group.openExternal')}
        >
          <ExternalLink size={14} />
        </button>

        {isTauri && (
          <button
            type="button"
            onClick={() => void close()}
            disabled={!windowOpen}
            className={cn(
              'rounded p-1.5 transition-colors',
              'text-[var(--fg-secondary)] hover:text-[var(--fg-danger)]',
              'hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40'
            )}
            title={t('dock.preview_group.closeWindow')}
            aria-label={t('dock.preview_group.closeWindow')}
          >
            <X size={14} />
          </button>
        )}
      </form>

      {error && (
        <div
          role="alert"
          className="border-b border-[var(--border)] bg-[var(--bg-danger-subtle)] px-3 py-1.5 text-xs text-[var(--fg-danger)]"
        >
          {error}
        </div>
      )}

      {isTauri ? (
        <div className="relative min-h-0 flex-1">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--fg-muted)]">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-xs">{t('dock.preview_group.loading')}</p>
            </div>
          ) : showClosedState ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-[var(--fg-muted)]">
              <Globe size={32} />
              <p className="text-sm">{t('dock.preview_group.windowClosed')}</p>
              <button
                type="button"
                onClick={() => void navigate(url)}
                className="rounded bg-[var(--accent)] px-3 py-1 text-xs text-white hover:bg-[var(--accent-hover)]"
              >
                {t('dock.preview_group.reopen')}
              </button>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-[var(--fg-muted)]">
              <Globe size={32} />
              <p className="text-sm">{t('dock.preview_group.separateWindow')}</p>
              <p className="max-w-xs font-mono text-xs">{url}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 bg-white">
          <iframe
            ref={iframeRef}
            src={url}
            title={t('dock.preview_group.title')}
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
            className="h-full w-full border-0"
            onLoad={() => setFrameLoading(false)}
            onError={() => setFrameLoading(false)}
          />
          {frameLoading && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-base)]">
              <Loader2 size={24} className="animate-spin text-[var(--fg-muted)]" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
