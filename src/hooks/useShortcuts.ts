import { useCallback, useEffect, useState } from 'react'
import { useLayoutState } from './useLayoutState'

type ShortcutHandler = (event: KeyboardEvent) => void

/**
 * `ctrlOrMeta` lets one binding serve both platforms: on macOS the user
 * presses Cmd, elsewhere Ctrl. Requiring BOTH keys (the previous behaviour)
 * made every shortcut dead on real hardware.
 */
interface ShortcutBinding {
  key: string
  ctrl?: boolean
  meta?: boolean
  ctrlOrMeta?: boolean
  alt?: boolean
  shift?: boolean
  handler: ShortcutHandler
  description: string
}

function keyMatches(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) return false

  if (binding.ctrlOrMeta) {
    if (!event.metaKey && !event.ctrlKey) return false
    if (event.altKey !== !!binding.alt) return false
    if (event.shiftKey !== !!binding.shift) return false
    return true
  }

  if (binding.ctrl && !event.ctrlKey) return false
  if (binding.meta && !event.metaKey) return false
  if (binding.alt && !event.altKey) return false
  if (binding.shift && !event.shiftKey) return false
  // Ensure no extra modifiers
  if (!binding.ctrl && event.ctrlKey) return false
  if (!binding.meta && event.metaKey) return false
  if (!binding.alt && event.altKey) return false
  if (!binding.shift && event.shiftKey) return false
  return true
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (target.isContentEditable) return true
  return false
}

/**
 * Global keyboard shortcuts. Must be mounted once, at the app top level, so
 * exactly one `window.keydown` listener exists. Layout mutations come from
 * the single `useLayoutState` provider.
 */
export function useShortcuts() {
  const { setRailView, toggleSidebar, toggleDock } = useLayoutState()

  const [bindings, setBindings] = useState<ShortcutBinding[]>(() => [
    {
      key: 'k',
      ctrlOrMeta: true,
      handler: () => {
        const composer = document.querySelector('textarea[placeholder*="message"], textarea[placeholder*="消息"]') as HTMLTextAreaElement
        composer?.focus()
      },
      description: 'Focus composer',
    },
    {
      key: '1',
      ctrlOrMeta: true,
      handler: () => setRailView('sessions'),
      description: 'Switch to Sessions',
    },
    {
      key: '2',
      ctrlOrMeta: true,
      handler: () => setRailView('worktrees'),
      description: 'Switch to Worktrees',
    },
    {
      key: '3',
      ctrlOrMeta: true,
      handler: () => setRailView('agents'),
      description: 'Switch to Agents',
    },
    {
      key: '4',
      ctrlOrMeta: true,
      handler: () => setRailView('tools'),
      description: 'Switch to Tools',
    },
    {
      key: '5',
      ctrlOrMeta: true,
      handler: () => setRailView('settings'),
      description: 'Switch to Settings',
    },
    {
      key: '6',
      ctrlOrMeta: true,
      handler: () => setRailView('help'),
      description: 'Switch to Help',
    },
    {
      key: '7',
      ctrlOrMeta: true,
      handler: () => setRailView('debug'),
      description: 'Switch to Debug',
    },
    {
      key: 'a',
      ctrlOrMeta: true,
      alt: true,
      handler: () => setRailView('agents'),
      description: 'Toggle agents sidebar',
    },
    {
      key: 'm',
      ctrl: true,
      shift: true,
      handler: () => setRailView('sessions'),
      description: 'Toggle rail',
    },
    {
      key: '\\',
      ctrlOrMeta: true,
      handler: toggleDock,
      description: 'Toggle right dock',
    },
    {
      key: 'b',
      ctrlOrMeta: true,
      handler: toggleSidebar,
      description: 'Toggle sidebar',
    },
    {
      key: 'Escape',
      handler: () => {
        // Close modal / cancel approval / blur focus. ApprovalModal renders
        // a role="dialog" portal, so the first branch covers it.
        const activeModal = document.querySelector('[role="dialog"]:not([hidden])')
        if (activeModal) {
          const cancelBtn = activeModal.querySelector(
            'button[aria-label*="close" i], button[aria-label*="关闭"], button[data-cancel]'
          ) as HTMLButtonElement
          cancelBtn?.click()
          return
        }
        (document.activeElement as HTMLElement)?.blur()
      },
      description: 'Close modal / cancel / blur',
    },
  ])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Escape must work while typing too: it dismisses dialogs and blurs the
      // focused field, which is the only way to leave the composer.
      if (event.key !== 'Escape' && isTypingTarget(event.target)) return

      for (const binding of bindings) {
        if (keyMatches(event, binding)) {
          event.preventDefault()
          binding.handler(event)
          break
        }
      }
    },
    [bindings],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const registerShortcut = useCallback((binding: ShortcutBinding) => {
    setBindings((prev) => [...prev, binding])
  }, [])

  const unregisterShortcut = useCallback(
    (key: string, modifiers?: { ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean }) => {
      setBindings((prev) =>
        prev.filter((binding) => {
          if (binding.key.toLowerCase() !== key.toLowerCase()) return true
          if (modifiers) {
            if (modifiers.ctrl !== undefined && binding.ctrl !== modifiers.ctrl) return true
            if (modifiers.meta !== undefined && binding.meta !== modifiers.meta) return true
            if (modifiers.alt !== undefined && binding.alt !== modifiers.alt) return true
            if (modifiers.shift !== undefined && binding.shift !== modifiers.shift) return true
          }
          return false
        }),
      )
    },
    [],
  )

  return { registerShortcut, unregisterShortcut }
}
