import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import { Copy, Loader2, PlugZap, Terminal as TerminalIcon, Trash2, Unplug } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useTerminal } from '@/hooks/useTerminal'

const TERMINAL_FONT_FAMILY = '"JetBrains Mono", "Fira Code", monospace'

export function TerminalTab() {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resizeRef = useRef<((cols: number, rows: number) => void) | null>(null)
  const [hasSelection, setHasSelection] = useState(false)

  const terminal = useTerminal()
  const { attachXterm, resize, connect, disconnect } = terminal
  const { connected, connecting, cols, rows, pid, error } = terminal

  // The xterm instance is rebuilt only when the PTY session changes. Depending
  // on the whole `terminal` object (which changes every render) used to destroy
  // and recreate the terminal on every state update, wiping the scrollback.
  const xtermKey = pid == null ? 'idle' : String(pid)

  useEffect(() => {
    resizeRef.current = resize
  }, [resize])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: TERMINAL_FONT_FAMILY,
      theme: {
        background: 'var(--bg-base)',
        foreground: 'var(--fg-primary)',
        cursor: 'var(--accent)',
        black: 'var(--terminal-black)',
        red: 'var(--terminal-red)',
        green: 'var(--terminal-green)',
        yellow: 'var(--terminal-yellow)',
        blue: 'var(--terminal-blue)',
        magenta: 'var(--terminal-magenta)',
        cyan: 'var(--terminal-cyan)',
        white: 'var(--terminal-white)',
        brightBlack: 'var(--terminal-bright-black)',
        brightRed: 'var(--terminal-bright-red)',
        brightGreen: 'var(--terminal-bright-green)',
        brightYellow: 'var(--terminal-bright-yellow)',
        brightBlue: 'var(--terminal-bright-blue)',
        brightMagenta: 'var(--terminal-bright-magenta)',
        brightCyan: 'var(--terminal-bright-cyan)',
        brightWhite: 'var(--terminal-bright-white)',
      },
      convertEol: true,
      scrollback: 10000,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Reading `xtermRef.current` during render is not allowed, so mirror the
    // selection state and let the Copy button depend on it.
    const selectionSub = term.onSelectionChange(() => {
      setHasSelection(term.getSelection().length > 0)
    })

    const detach = attachXterm({
      write: (data) => term.write(data),
      resize: (nextCols, nextRows) => {
        term.resize(nextCols, nextRows)
        fitAddon.fit()
      },
      dispose: () => {
        if (xtermRef.current !== term) return
        term.dispose()
        xtermRef.current = null
        fitAddonRef.current = null
      },
      onData: (handler) => {
        const subscription = term.onData(handler)
        return () => subscription.dispose()
      },
    })

    // Refit (and push the new geometry to the PTY) whenever the dock is resized.
    const observer = new ResizeObserver(() => {
      fitAddon.fit()
      if (xtermRef.current) resizeRef.current?.(xtermRef.current.cols, xtermRef.current.rows)
    })
    observer.observe(container)

    return () => {
      selectionSub.dispose()
      observer.disconnect()
      detach()
      if (xtermRef.current === term) {
        term.dispose()
        xtermRef.current = null
        fitAddonRef.current = null
      }
    }
  }, [xtermKey, attachXterm])

  const clearTerminal = useCallback(() => {
    xtermRef.current?.clear()
  }, [])

  const copySelection = useCallback(() => {
    const selection = xtermRef.current?.getSelection()
    if (!selection) return
    navigator.clipboard.writeText(selection).catch((err) => {
      console.error('[terminal] copy failed', err)
    })
  }, [])

  const paste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) terminal.write(text)
    } catch (err) {
      console.error('[terminal] paste failed', err)
    }
  }, [terminal])

  return (
    <div className="flex h-full flex-col bg-[var(--bg-base)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-elevated)] p-2">
        <TerminalIcon size={14} className="shrink-0 text-[var(--fg-muted)]" />
        <span className="text-xs font-medium text-[var(--fg-secondary)]">
          {connected
            ? t('dock.terminal_group.connected')
            : connecting
              ? t('dock.terminal_group.connecting')
              : t('dock.terminal_group.disconnected')}
        </span>
        <span className="font-mono text-xs text-[var(--fg-muted)]">
          {cols}×{rows}
        </span>
        {pid != null && (
          <span className="font-mono text-xs text-[var(--fg-muted)]">PID: {pid}</span>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={copySelection}
          disabled={!hasSelection}
          className={cn(
            'rounded p-1.5 transition-colors',
            'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
            'hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50'
          )}
          title={t('dock.terminal_group.copy')}
          aria-label={t('dock.terminal_group.copy')}
        >
          <Copy size={14} />
        </button>

        <button
          type="button"
          onClick={paste}
          disabled={!connected}
          className={cn(
            'rounded p-1.5 transition-colors',
            'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
            'hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50'
          )}
          title={t('dock.terminal_group.paste')}
          aria-label={t('dock.terminal_group.paste')}
        >
          <PlugZap size={14} />
        </button>

        <button
          type="button"
          onClick={clearTerminal}
          className={cn(
            'rounded p-1.5 transition-colors',
            'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
            'hover:bg-[var(--bg-hover)]'
          )}
          title={t('dock.terminal_group.clear')}
          aria-label={t('dock.terminal_group.clear')}
        >
          <Trash2 size={14} />
        </button>

        {connected ? (
          <button
            type="button"
            onClick={() => void disconnect()}
            className={cn(
              'rounded p-1.5 transition-colors',
              'text-[var(--fg-secondary)] hover:text-[var(--fg-danger)]',
              'hover:bg-[var(--bg-hover)]'
            )}
            title={t('dock.terminal_group.disconnect')}
            aria-label={t('dock.terminal_group.disconnect')}
          >
            <Unplug size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void connect()}
            disabled={connecting}
            className={cn(
              'rounded p-1.5 transition-colors',
              'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
              'hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50'
            )}
            title={t('dock.terminal_group.connect')}
            aria-label={t('dock.terminal_group.connect')}
          >
            <PlugZap size={14} />
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative min-h-0 flex-1"
        tabIndex={0}
        role="application"
        aria-label={t('dock.terminal_group.ariaLabel')}
      >
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-[var(--fg-danger)]">
            <TerminalIcon size={32} />
            <p className="text-sm font-medium">{t('dock.terminal_group.error')}</p>
            <p className="max-w-xs text-center text-xs text-[var(--fg-muted)]">{error}</p>
            <button
              type="button"
              onClick={() => void connect()}
              className="rounded bg-[var(--accent)] px-3 py-1 text-xs text-white hover:bg-[var(--accent-hover)]"
            >
              {t('dock.terminal_group.retry')}
            </button>
          </div>
        ) : connecting ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--fg-muted)]">
            <Loader2 size={32} className="animate-spin" />
            <p className="text-sm">{t('dock.terminal_group.connecting')}</p>
          </div>
        ) : !connected ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-[var(--fg-muted)]">
            <Unplug size={32} />
            <p className="text-sm">{t('dock.terminal_group.disconnected')}</p>
            <button
              type="button"
              onClick={() => void connect()}
              className="rounded bg-[var(--accent)] px-3 py-1 text-xs text-white hover:bg-[var(--accent-hover)]"
            >
              {t('dock.terminal_group.connect')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
