import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Trap focus inside `containerRef` while `enabled`.
 *
 * Escape is listened for on `document` in the capture phase so it works even
 * when the caret is inside an input or textarea (typing targets must not be
 * special-cased), and IME composition is left alone.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  onEscape: () => void,
  enabled = true,
): void {
  const onEscapeRef = useRef(onEscape)

  useEffect(() => {
    onEscapeRef.current = onEscape
  }, [onEscape])

  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const getFocusable = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getClientRects().length > 0,
      )

    // Respect an explicit autoFocus target; otherwise focus the first control.
    if (!(document.activeElement instanceof HTMLElement && container.contains(document.activeElement))) {
      getFocusable()[0]?.focus()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onEscapeRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const items = getFocusable()
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      previouslyFocused?.focus()
    }
  }, [containerRef, enabled])
}
