import { test, expect, type Page } from '@playwright/test'

// This spec drives the clock and asserts on IPC frames; it does not need
// recordings. The sandbox has no playwright ffmpeg binary, and `video:
// 'retain-on-failure'` from playwright.config.ts would make every context
// creation fail at browserContext.newPage without it.
test.use({ video: 'off' })

/**
 * M3 e2e smoke: approval flows over the mocked Tauri IPC bridge.
 *
 * Extends the mock harness from scripts/e2e_smoke.spec.ts with the M3
 * protocol pieces:
 *   - tool_execution_start / tool_execution_end bracketing an approval-gated
 *     bash tool call,
 *   - ui_request (select / bash) in the blueprint §0 wire shape,
 *   - send_ui_response recorded as the extension_ui_response host frame
 *     (same encoding as crates/omp-host/src/session.rs OutboundMessage::UiResponse:
 *     {"type":"extension_ui_response","id":…,"value":…}).
 *
 * Flows:
 *   A approve  -> ToolCard renders (verbatim command + linkified output paths)
 *                 -> 「打开完整输出」 opens the Preview dock
 *   B deny     -> {cancelled:true} frame + the turn stops (session settles,
 *                 no tool result, no assistant reply)
 *   C timeout  -> mocked clock expires the approval window -> {cancelled:true}
 *                 frame + modal cleanup
 */

const TOOL_COMMAND =
  'echo APPROVE_OK > /tmp/probe.txt && echo "see /home/u/proj/src/main.ts:42 for details"'
const TOOL_OUTPUT = [
  'wrote /tmp/probe.txt',
  'see /home/u/proj/src/main.ts:42 for details',
  'done',
].join('\n')
const ASSISTANT_REPLY = 'Approved. The command ran; its output is in the tool card.'

/** Fixed fake time base for the timeout flow. */
const FROZEN_TIME = '2026-01-01T00:00:00Z'
/** Boot offset so page load finishes before the clock freezes. */
const FROZEN_AFTER_LOAD = '2026-01-01T00:00:05Z'

interface UiResponseFrame {
  type: string
  id: string
  value: unknown
}

/**
 * Mock backend. Same bridge as scripts/e2e_smoke.spec.ts, plus the M3
 * approval-gate sequence: send_prompt starts a bash tool call and pauses it
 * on a ui_request select gate until send_ui_response answers.
 */
const MOCK_SCRIPT = (fixtures: { command: string; output: string; reply: string }) => {
  const callbacks = new Map<number, (event: unknown) => void>()
  let nextCallbackId = 1
  const listeners = new Map<string, Set<number>>()
  const sessions = new Map<
    string,
    { id: string; cwd: string; alive: boolean; createdAt: number }
  >()
  /** extension_ui_response frames the frontend sent back (host wire encoding). */
  const uiResponses: UiResponseFrame[] = []
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
          // The tool starts, then pauses on the approval gate.
          emit('omp://event', {
            sessionId: sid,
            event: {
              type: 'tool_execution_start',
              toolCallId: 'call_m3_1',
              name: 'bash',
              args: { command: fixtures.command },
            },
          })
          // Blueprint §0 wire shape for an approval-gated bash call.
          emit('omp://event', {
            sessionId: sid,
            event: {
              type: 'ui_request',
              id: 'ui-m3-1',
              method: 'select',
              title: 'Allow tool: bash\nCommand: ' + fixtures.command,
              options: ['Approve', 'Deny'],
              extra: { tool: 'bash', command: fixtures.command },
            },
          })
        }, 20)
        return null
      }
      case 'send_ui_response': {
        const sid = args.sessionId as string
        const requestId = args.requestId as string
        const response = args.response
        uiResponses.push({ type: 'extension_ui_response', id: requestId, value: response })
        setTimeout(() => {
          if (response === 'Approve') {
            emit('omp://event', {
              sessionId: sid,
              event: {
                type: 'tool_execution_end',
                toolCallId: 'call_m3_1',
                name: 'bash',
                status: 'ok',
                result: { content: [{ type: 'text', text: fixtures.output }] },
              },
            })
            emit('omp://event', {
              sessionId: sid,
              event: { type: 'message_start', role: 'assistant', messageId: 'm3' },
            })
            let i = 0
            const timer = setInterval(() => {
              const next = Math.min(i + 6, fixtures.reply.length)
              emit('omp://event', {
                sessionId: sid,
                event: { type: 'message_delta', kind: 'text', delta: fixtures.reply.slice(i, next) },
              })
              i = next
              if (i >= fixtures.reply.length) {
                clearInterval(timer)
                emit('omp://event', { sessionId: sid, event: { type: 'message_end', messageId: 'm3' } })
                emit('omp://event', { sessionId: sid, event: { type: 'turn_end' } })
                emit('omp://event', { sessionId: sid, event: { type: 'agent_end' } })
                emit('omp://event', { sessionId: sid, event: { type: 'session_settled' } })
              }
            }, 40)
          } else {
            // Deny or approval timeout: the turn stops without a tool result.
            emit('omp://event', { sessionId: sid, event: { type: 'turn_end' } })
            emit('omp://event', { sessionId: sid, event: { type: 'agent_end' } })
            emit('omp://event', { sessionId: sid, event: { type: 'session_settled' } })
          }
        }, 5)
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
    uiResponses,
  }
}

async function bootPage(page: Page): Promise<void> {
  await page.addInitScript(MOCK_SCRIPT, {
    command: TOOL_COMMAND,
    output: TOOL_OUTPUT,
    reply: ASSISTANT_REPLY,
  })
  await page.goto('http://localhost:1420', { waitUntil: 'networkidle', timeout: 30000 })
  const composer = page.locator('textarea[placeholder*="message"]').first()
  await expect(composer).toBeVisible({ timeout: 30000 })
}

/** Reads the extension_ui_response frames the frontend sent back. */
async function readUiResponses(page: Page): Promise<UiResponseFrame[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __OMP_MOCK__: { uiResponses: UiResponseFrame[] } }).__OMP_MOCK__
        .uiResponses,
  )
}

test.describe('omp m3 approval smoke', () => {
  test('flow A: approve renders ToolCard (command + path links) and opens Preview', async ({
    page,
  }) => {
    await bootPage(page)
    const composer = page.locator('textarea[placeholder*="message"]').first()

    await composer.fill('run the probe')
    await composer.press('Enter')

    // The ui_request gate renders the verbatim bash command, danger bar, countdown.
    await expect(page.getByTestId('approval-bash-command')).toHaveText(TOOL_COMMAND)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByTestId('approval-countdown')).toHaveText(/Auto-cancel in \d+s/)

    // Approve via the select option.
    await page.getByRole('button', { name: 'Approve', exact: true }).click()

    // Frontend answered with the extension_ui_response wire frame.
    await expect.poll(() => readUiResponses(page)).toEqual([
      { type: 'extension_ui_response', id: 'ui-m3-1', value: 'Approve' },
    ])

    // The tool call completes and the assistant replies.
    await expect(page.getByText('Done', { exact: true }).first()).toBeVisible()
    await expect(page.locator('[data-role="assistant"]').first()).toContainText('Approved')

    // Expand the bash card: verbatim command + linkified output paths.
    await page.getByText('bash', { exact: true }).first().click()
    await expect(page.getByTestId('tool-command')).toHaveText(TOOL_COMMAND)
    await expect(page.getByRole('button', { name: '/tmp/probe.txt', exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: '/home/u/proj/src/main.ts:42', exact: true }),
    ).toBeVisible()

    // Bare path link opens the Preview dock.
    await page.getByRole('button', { name: '/tmp/probe.txt', exact: true }).click()
    await expect(page.locator('#dock-tab-preview')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#dock-panel-preview')).toBeVisible()

    // :line path link routes to the diff dock.
    await page.getByRole('button', { name: '/home/u/proj/src/main.ts:42', exact: true }).click()
    await expect(page.locator('#dock-tab-diff')).toHaveAttribute('aria-selected', 'true')

    // 「打开完整输出」 switches the dock back to Preview.
    await page.getByRole('button', { name: 'Open full output', exact: true }).click()
    await expect(page.locator('#dock-tab-preview')).toHaveAttribute('aria-selected', 'true')
    await expect(composer).toBeEnabled()
  })

  test('flow B: deny sends {cancelled:true} and stops the turn', async ({ page }) => {
    await bootPage(page)
    const composer = page.locator('textarea[placeholder*="message"]').first()

    await composer.fill('run the probe')
    await composer.press('Enter')

    await expect(page.getByTestId('approval-bash-command')).toHaveText(TOOL_COMMAND)
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible()

    // Deny via the modal footer (the locked {cancelled:true} encoding).
    await page.locator('[data-cancel="true"]').click()

    await expect.poll(() => readUiResponses(page)).toEqual([
      { type: 'extension_ui_response', id: 'ui-m3-1', value: { cancelled: true } },
    ])

    // Modal cleaned up, session settled, composer live again.
    await expect(page.getByTestId('approval-bash-command')).toHaveCount(0)
    await expect(composer).toBeEnabled()

    // The turn stopped: tool never completed, no assistant reply.
    await expect(page.getByText('Done', { exact: true })).toHaveCount(0)
    await expect(page.locator('[data-role="assistant"]')).toHaveCount(0)
    await expect(page.getByText('Running', { exact: true }).first()).toBeVisible()
  })

  test('flow C: approval timeout (mocked clock) sends {cancelled:true} and cleans up', async ({
    page,
  }) => {
    await page.addInitScript(MOCK_SCRIPT, {
      command: TOOL_COMMAND,
      output: TOOL_OUTPUT,
      reply: ASSISTANT_REPLY,
    })
    await page.clock.install({ time: new Date(FROZEN_TIME) })
    await page.goto('http://localhost:1420', { waitUntil: 'networkidle', timeout: 30000 })
    const composer = page.locator('textarea[placeholder*="message"]').first()
    await expect(composer).toBeVisible({ timeout: 30000 })

    // Freeze the clock right after boot; nothing advances except runFor().
    await page.clock.pauseAt(new Date(FROZEN_AFTER_LOAD))

    await composer.fill('run the probe')
    await composer.press('Enter')

    // The 20ms prompt chain fires on the mocked clock, then the gate appears.
    await page.clock.runFor(50)
    await expect(page.getByTestId('approval-bash-command')).toBeVisible()
    await expect(page.getByTestId('approval-countdown')).toHaveText(/Auto-cancel in \d+s/)

    // Advance past the 60s approval window.
    await page.clock.runFor(61_000)

    await expect.poll(() => readUiResponses(page)).toEqual([
      { type: 'extension_ui_response', id: 'ui-m3-1', value: { cancelled: true } },
    ])

    // Cleanup: modal gone, composer re-enabled, tool never completed.
    await expect(page.getByTestId('approval-countdown')).toHaveCount(0)
    await expect(page.getByTestId('approval-bash-command')).toHaveCount(0)
    await expect(composer).toBeEnabled()
    await expect(page.getByText('Done', { exact: true })).toHaveCount(0)
  })
})
