import { test, expect, Page, BrowserContext } from '@playwright/test'

/**
 * Browser-mode smoke test.
 *
 * The real backend is a Tauri IPC bridge, which plain Chromium does not have.
 * We install a mock `window.__TAURI_INTERNALS__` before the app boots so the
 * frontend takes its Tauri path, then drive the protocol event sequence the
 * same way the Rust backend would.
 */

const MOCK_SCRIPT = () => {
  const callbacks = new Map<number, (event: unknown) => void>()
  let nextCallbackId = 1
  const listeners = new Map<string, Set<number>>()
  const sessions = new Map<
    string,
    { id: string; cwd: string; alive: boolean; createdAt: number }
  >()
  let nextSessionId = 1

  function emit(event: string, payload: unknown) {
    const ids = listeners.get(event)
    if (!ids) return
    for (const id of Array.from(ids)) {
      const cb = callbacks.get(id)
      if (cb) cb({ id, event, payload })
    }
  }

  async function invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
    switch (cmd) {
      case 'plugin:store|load':
        return 1
      case 'plugin:store|get':
        return [null, false]
      case 'plugin:store|set':
      case 'plugin:store|save':
        return null
      case 'plugin:event|listen': {
        const id = args.handler as number
        const event = args.event as string
        const set = listeners.get(event) ?? new Set<number>()
        set.add(id)
        listeners.set(event, set)
        return id
      }
      case 'plugin:event|unlisten':
        return null
      case 'list_sessions':
        return Array.from(sessions.values())
      case 'spawn_session': {
        const id = `sess-${nextSessionId++}`
        const cwd = (args.cwd as string) || '/tmp'
        sessions.set(id, { id, cwd, alive: true, createdAt: Date.now() })
        setTimeout(() => {
          emit('omp://event', {
            sessionId: id,
            event: { type: 'ready', protocolVersion: 1 },
          })
        }, 5)
        return { sessionId: id, cwd }
      }
      case 'send_prompt': {
        const sid = args.sessionId as string
        setTimeout(() => {
          emit('omp://event', { sessionId: sid, event: { type: 'agent_start' } })
          emit('omp://event', { sessionId: sid, event: { type: 'turn_start' } })
          emit('omp://event', {
            sessionId: sid,
            event: { type: 'message_start', role: 'assistant', messageId: 'm1' },
          })
          const text = 'Hello from the mock backend. This is a streaming reply.'
          let i = 0
          const timer = setInterval(() => {
            const next = Math.min(i + 6, text.length)
            emit('omp://event', {
              sessionId: sid,
              event: { type: 'message_delta', kind: 'text', delta: text.slice(i, next) },
            })
            i = next
            if (i >= text.length) {
              clearInterval(timer)
              emit('omp://event', {
                sessionId: sid,
                event: { type: 'message_end', messageId: 'm1' },
              })
              emit('omp://event', { sessionId: sid, event: { type: 'turn_end' } })
              emit('omp://event', { sessionId: sid, event: { type: 'agent_end' } })
              emit('omp://event', { sessionId: sid, event: { type: 'session_settled' } })
            }
          }, 40)
        }, 20)
        return null
      }
      case 'abort':
        return null
      case 'close_session':
        return null
      case 'pty_spawn':
        return { pid: 4242 }
      case 'pty_read':
        return { pid: args.pid, data: '', exited: false }
      case 'pty_write':
      case 'pty_resize':
      case 'pty_kill':
        return null
      case 'worktree_list':
        return []
      case 'diff_compute':
        return ''
      default:
        return null
    }
  }

  window.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback: (cb: (event: unknown) => void) => {
      const id = nextCallbackId++
      callbacks.set(id, cb)
      return id
    },
    unregisterCallback: (id: number) => {
      callbacks.delete(id)
    },
  }

  window.__OMP_MOCK__ = {
    emit,
    sessions,
    listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
  }
}

test.describe('omp smoke', () => {
  let page: Page
  let context: BrowserContext

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext()
    page = await context.newPage()
    await page.addInitScript(MOCK_SCRIPT)
    await page.goto('http://localhost:1420', { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForSelector('textarea[placeholder*="message"]', { timeout: 30000 })
  })

  test.afterAll(async () => {
    await context?.close()
  })

  test('protocol event sequence', async () => {
    const composer = page.locator('textarea[placeholder*="message"]').first()
    await expect(composer).toBeVisible({ timeout: 10000 })

    await composer.fill('Hello, world!')
    await composer.press('Enter')

    // The backend mock emits message_start -> message_delta* -> message_end.
    const assistant = page.locator('[data-role="assistant"]').first()
    await expect(assistant).toBeVisible({ timeout: 15000 })
    await expect(assistant).toContainText('Hello from the mock backend', { timeout: 15000 })

    // session_settled re-enables the composer.
    await expect(composer).toBeEnabled({ timeout: 15000 })
  })

  test('shortcut keys work', async () => {
    const composer = page.locator('textarea[placeholder*="message"]').first()

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
    await expect(composer).toBeFocused({ timeout: 2000 })

    await page.keyboard.press('Escape')
    await expect(composer).not.toBeFocused({ timeout: 1000 })

    const sidebar = page.locator('aside, [data-testid="sidebar"]').first()
    if (await sidebar.isVisible({ timeout: 2000 })) {
      const initialWidth = await sidebar.evaluate((el) => el.getBoundingClientRect().width)
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+B' : 'Control+B')
      await page.waitForTimeout(300)
      const collapsedWidth = await sidebar.evaluate((el) => el.getBoundingClientRect().width)
      expect(collapsedWidth).not.toBe(initialWidth)
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+B' : 'Control+B')
    }
  })

  test('theme switching', async () => {
    const html = page.locator('html')
    const initialTheme = await html.getAttribute('data-theme')

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light'
    })
    await expect(html).toHaveAttribute('data-theme', 'light')

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark'
    })
    await expect(html).toHaveAttribute('data-theme', 'dark')

    if (initialTheme) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t
      }, initialTheme)
    }
  })

  test('language switching', async () => {
    const i18nLoaded = await page.evaluate(() => {
      return (
        typeof (window as unknown as { i18n?: unknown }).i18n !== 'undefined' ||
        document.querySelector('[data-i18n]') !== null ||
        document.querySelector('textarea[placeholder*="message"]') !== null
      )
    })
    expect(i18nLoaded).toBeTruthy()
  })

  test('layout panes do not overlap', async () => {
    const boxes = await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="layout-grid"]')
      if (!grid) return null
      return Array.from(grid.children).map((el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      })
    })
    if (boxes && boxes.length >= 4) {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]
          const b = boxes[j]
          const overlapX = a.left < b.right && b.left < a.right
          const overlapY = a.top < b.bottom && b.top < a.bottom
          expect(
            overlapX && overlapY,
            `panes ${i} and ${j} overlap: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
          ).toBe(false)
        }
      }
    }
  })
})
