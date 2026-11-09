import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useFocusTrap } from './useFocusTrap'

interface ModalShellProps {
  /** id of the element that labels the dialog (aria-labelledby). */
  labelledBy: string
  onCancel: () => void
  children: ReactNode
  className?: string
  dialogClassName?: string
  /** Disable click-outside-to-cancel (full-screen surfaces). */
  lockMask?: boolean
}

/**
 * Shared modal chrome: portal, backdrop, dialog semantics and the focus trap.
 */
export function ModalShell({
  labelledBy,
  onCancel,
  children,
  className,
  dialogClassName,
  lockMask = false,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, onCancel)

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center',
        'bg-[var(--overlay-backdrop)] p-4',
        className,
      )}
      onMouseDown={(event) => {
        if (lockMask) return
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          'flex max-h-full w-full max-w-lg flex-col overflow-hidden',
          'rounded-[var(--radius-lg)] border border-[var(--border)]',
          'bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)]',
          dialogClassName,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
