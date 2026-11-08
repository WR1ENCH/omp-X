import { act, render, renderHook } from '@testing-library/react'
import { listen } from '@tauri-apps/api/event'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { FrontendEvent } from '@/types/ipc'
import type { Message } from '@/types/transcript'
import {
  applyMessageEnd,
  applyMessageStart,
  applyPromptResult,
  applyStreamDelta,
  applyToolExecutionEnd,
  applyToolExecutionStart,
  createInitialTranscriptState,
  parseEventPayload,
  TranscriptProvider,
  useTranscript,
  type TranscriptContextValue,
} from './useTranscript'

const listenMock = listen as unknown as Mock

function event(type: FrontendEvent['type'], extra: Partial<FrontendEvent> = {}): FrontendEvent {
  return { type, ...extra } as FrontendEvent
}

function envelope(sessionId: string, event: FrontendEvent): unknown {
  return { sessionId, event }
}

function assistantText(source: { messages: Message[] } | null): string {
  return (source?.messages ?? [])
    .flatMap((message) => message.blocks)
    .filter((block) => block.type === 'assistant')
    .map((block) => (block.type === 'assistant' ? block.content : ''))
    .join('')
}

interface TauriEventLike {
  event: string
  payload: unknown
  id?: number
}

let handler: ((event: TauriEventLike) => void) | undefined

beforeEach(() => {
  vi.clearAllMocks()
  handler = undefined
  listenMock.mockImplementation(async (...args: unknown[]) => {
    handler = args[1] as ((event: TauriEventLike) => void) | undefined
    return () => {}
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pure reducers', () => {
  it('starts from an empty, anchored, non-streaming state', () => {
    const state = createInitialTranscriptState()
    expect(state.messages).toEqual([])
    expect(state.isStreaming).toBe(false)
    expect(state.anchorToBottom).toBe(true)
    expect(state.pendingToolCalls.size).toBe(0)
    expect(state.currentStreamingMessageId).toBeNull()
  })

  it('parses envelopes, unwrapped events and rejects garbage', () => {
    expect(parseEventPayload(envelope('s1', event('turn_start')))).toEqual({
      sessionId: 's1',
      event: event('turn_start'),
    })
    expect(parseEventPayload(event('turn_start'))).toEqual({
      sessionId: null,
      event: event('turn_start'),
    })
    expect(parseEventPayload({ event: 'omp://event', payload: envelope('s1', event('turn_start')) })).toEqual({
      sessionId: 's1',
      event: event('turn_start'),
    })
    expect(parseEventPayload(null)).toBeNull()
    expect(parseEventPayload('nope')).toBeNull()
    expect(parseEventPayload({ hello: 'world' })).toBeNull()
  })

  it('message_start opens exactly one assistant block with no empty thinking block', () => {
    const next = applyMessageStart(createInitialTranscriptState(), event('message_start', { role: 'assistant', messageId: 'a1' }), 's1')
    expect(next.messages).toHaveLength(1)
    expect(next.messages[0].id).toBe('a1')
    expect(next.messages[0].role).toBe('assistant')
    expect(next.messages[0].blocks).toHaveLength(1)
    expect(next.messages[0].blocks[0].type).toBe('assistant')
    expect(next.isStreaming).toBe(true)
    expect(next.currentStreamingMessageId).toBe('a1')
  })

  it('message_start ignores duplicate ids', () => {
    const once = applyMessageStart(createInitialTranscriptState(), event('message_start', { messageId: 'a1' }), 's1')
    const twice = applyMessageStart(once, event('message_start', { messageId: 'a1' }), 's1')
    expect(twice).toBe(once)
  })

  it('message_delta appends text and creates a thinking block only when thinking arrives', () => {
    let state = applyMessageStart(createInitialTranscriptState(), event('message_start', { messageId: 'a1' }), 's1')
    state = applyStreamDelta(state, { text: 'Hello', thinking: '' })
    expect(assistantText(state)).toBe('Hello')
    expect(state.messages[0].blocks.map((block) => block.type)).toEqual(['assistant'])

    state = applyStreamDelta(state, { text: '', thinking: 'hmm' })
    expect(state.messages[0].blocks.map((block) => block.type)).toEqual(['thinking', 'assistant'])
    const thinking = state.messages[0].blocks[0]
    expect(thinking.type === 'thinking' && thinking.content).toBe('hmm')
  })

  it('message_delta is a no-op without a streaming target or with an empty delta', () => {
    const idle = createInitialTranscriptState()
    expect(applyStreamDelta(idle, { text: 'x', thinking: '' })).toBe(idle)
    const started = applyMessageStart(idle, event('message_start', { messageId: 'a1' }), 's1')
    expect(applyStreamDelta(started, { text: '', thinking: '' })).toBe(started)
  })

  it('message_end finalizes only the matching message', () => {
    let state = applyMessageStart(createInitialTranscriptState(), event('message_start', { messageId: 'a1' }), 's1')
    state = applyStreamDelta(state, { text: 'partial', thinking: '' })
    state = applyMessageEnd(state, event('message_end', { messageId: 'a1' }))
    expect(state.isStreaming).toBe(false)
    expect(state.currentStreamingMessageId).toBeNull()
    const assistant = state.messages[0].blocks[0]
    expect(assistant.type === 'assistant' && assistant.streaming).toBe(false)
  })

  it('tool_execution_start opens a pending tool call and appends a card', () => {
    let state = applyMessageStart(createInitialTranscriptState(), event('message_start', { messageId: 'a1' }), 's1')
    state = applyToolExecutionStart(state, event('tool_execution_start', { toolCallId: 't1', name: 'bash', args: { cmd: 'ls' } }))
    expect(state.pendingToolCalls.get('t1')?.status).toBe('pending')
    const card = state.messages[0].blocks.find((block) => block.type === 'tool-call')
    expect(card?.type === 'tool-call' && card.toolCallId).toBe('t1')
  })

  it('tool_execution_end settles the card and records failures', () => {
    let state = applyMessageStart(createInitialTranscriptState(), event('message_start', { messageId: 'a1' }), 's1')
    state = applyToolExecutionStart(state, event('tool_execution_start', { toolCallId: 't1', name: 'bash' }))
    state = applyToolExecutionEnd(state, event('tool_execution_end', { toolCallId: 't1', status: 'ok', result: 'done' }))
    expect(state.pendingToolCalls.get('t1')?.status).toBe('completed')
    expect(state.pendingToolCalls.get('t1')?.result).toBe('done')

    state = applyToolExecutionStart(state, event('tool_execution_start', { toolCallId: 't2', name: 'bash' }))
    state = applyToolExecutionEnd(state, event('tool_execution_end', { toolCallId: 't2', status: 'error', error: 'boom' }))
    expect(state.pendingToolCalls.get('t2')?.status).toBe('failed')
    expect(state.pendingToolCalls.get('t2')?.error).toBe('boom')
  })

  it('prompt_result records success and surfaces failures as system messages', () => {
    const ok = applyPromptResult(createInitialTranscriptState(), event('prompt_result', { success: true, status: 'done' }), 's1')
    expect(ok.lastPromptResult?.success).toBe(true)
    expect(ok.messages).toHaveLength(0)

    const failed = applyPromptResult(createInitialTranscriptState(), event('prompt_result', { success: false, status: 'rejected' }), 's1')
    expect(failed.lastPromptResult?.success).toBe(false)
    expect(failed.messages).toHaveLength(1)
    expect(failed.messages[0].blocks[0].type).toBe('system')
  })
})

describe('TranscriptProvider', () => {
  async function setup(sessionId: string | null = 's1') {
    let latest: TranscriptContextValue | null = null
    function Probe() {
      latest = useTranscript()
      return null
    }
    const utils = render(
      <TranscriptProvider sessionId={sessionId}>
        <Probe />
      </TranscriptProvider>,
    )
    await act(async () => {})
    return {
      latest: () => latest,
      emit: (payload: unknown) =>
        act(() => {
          // Mimic the Tauri `listen` callback argument: an Event wrapper whose
          // `payload` is the backend frame.
          handler?.({ event: 'omp://event', payload, id: 1 })
        }),
      rerender: (next: string | null) =>
        act(() => {
          utils.rerender(
            <TranscriptProvider sessionId={next}>
              <Probe />
            </TranscriptProvider>,
          )
        }),
    }
  }

  it('throws outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useTranscript())).toThrow(
      'useTranscript must be used within a TranscriptProvider',
    )
    spy.mockRestore()
  })

  it('subscribes to omp://event once and unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn()
    listenMock.mockImplementation(async () => unsubscribe)
    const { unmount } = render(
      <TranscriptProvider sessionId="s1">
        <div />
      </TranscriptProvider>,
    )
    await act(async () => {})
    expect(listenMock).toHaveBeenCalledTimes(1)
    expect(listenMock).toHaveBeenCalledWith('omp://event', expect.any(Function))
    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('ignores envelope events for another session', async () => {
    const provider = await setup('s1')
    provider.emit(envelope('other', event('message_start', { role: 'assistant', messageId: 'x' })))
    expect(provider.latest()?.messages).toHaveLength(0)
  })

  it('accepts unwrapped events (transition tolerance)', async () => {
    const provider = await setup('s1')
    provider.emit(event('message_start', { role: 'assistant', messageId: 'a1' }))
    expect(provider.latest()?.messages).toHaveLength(1)
  })

  it('streams a message end to end and clears isStreaming', async () => {
    const provider = await setup('s1')
    provider.emit(envelope('s1', event('message_start', { role: 'assistant', messageId: 'a1' })))
    expect(provider.latest()?.isStreaming).toBe(true)

    provider.emit(envelope('s1', event('message_delta', { kind: 'text', delta: 'Hi' })))
    provider.emit(envelope('s1', event('message_delta', { kind: 'text', delta: ' there' })))
    // No frame has run yet, so the buffer is still pending.
    expect(assistantText(provider.latest())).toBe('')

    provider.emit(envelope('s1', event('message_end', { messageId: 'a1' })))
    expect(assistantText(provider.latest())).toBe('Hi there')
    expect(provider.latest()?.isStreaming).toBe(false)
  })

  it('coalesces deltas into at most one flush per animation frame', async () => {
    const queue: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queue.push(cb)
      return queue.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})

    const provider = await setup('s1')
    provider.emit(envelope('s1', event('message_start', { role: 'assistant', messageId: 'a1' })))
    provider.emit(envelope('s1', event('message_delta', { kind: 'text', delta: 'Hello' })))
    provider.emit(envelope('s1', event('message_delta', { kind: 'text', delta: ' world' })))
    expect(queue).toHaveLength(1)
    expect(assistantText(provider.latest())).toBe('')

    act(() => {
      queue.shift()?.(0)
    })
    expect(assistantText(provider.latest())).toBe('Hello world')
  })

  it('dispatches omp:ui-request with the approval payload shape', async () => {
    const provider = await setup('s1')
    const seen: unknown[] = []
    window.addEventListener('omp:ui-request', (e) => seen.push((e as CustomEvent).detail))

    provider.emit(
      envelope(
        's1',
        event('ui_request', { id: 'r1', method: 'confirm', title: 'Approve?', options: ['yes'], extra: { a: 1 } }),
      ),
    )
    expect(seen).toEqual([
      { id: 'r1', request: { method: 'confirm', title: 'Approve?', options: ['yes'], extra: { a: 1 } } },
    ])
  })

  it('dispatches omp:available-models and omp:available-commands', async () => {
    const provider = await setup('s1')
    const models: unknown[] = []
    const commands: unknown[] = []
    window.addEventListener('omp:available-models', (e) => models.push((e as CustomEvent).detail))
    window.addEventListener('omp:available-commands', (e) => commands.push((e as CustomEvent).detail))

    provider.emit(envelope('s1', event('available_models', { models: [{ id: 'm1', name: 'Model 1' }] })))
    provider.emit(
      envelope('s1', event('available_commands', { commands: [{ name: '/help', description: 'Help' }] })),
    )
    expect(models).toEqual([[{ id: 'm1', name: 'Model 1' }]])
    expect(commands).toEqual([[{ name: '/help', description: 'Help' }]])
  })

  it('dispatches omp:session-settled and stops streaming', async () => {
    const provider = await setup('s1')
    const seen: unknown[] = []
    window.addEventListener('omp:session-settled', (e) => seen.push((e as CustomEvent).detail))

    provider.emit(envelope('s1', event('message_start', { role: 'assistant', messageId: 'a1' })))
    provider.emit(envelope('s1', event('session_settled')))
    expect(provider.latest()?.isStreaming).toBe(false)
    expect(seen).toHaveLength(1)
  })

  // The real wire ends a turn with prompt_result.sessionSettled and may never
  // emit a standalone session_settled frame.
  it('prompt_result.sessionSettled stops streaming and dispatches omp:session-settled', async () => {
    const provider = await setup('s1')
    const seen: unknown[] = []
    window.addEventListener('omp:session-settled', (e) => seen.push((e as CustomEvent).detail))

    provider.emit(envelope('s1', event('message_start', { role: 'assistant', messageId: 'a1' })))
    provider.emit(
      envelope('s1', event('prompt_result', { success: true, status: 'completed', sessionSettled: true })),
    )
    expect(provider.latest()?.isStreaming).toBe(false)
    expect(seen).toHaveLength(1)
  })

  it('addUserMessage appends a user message', async () => {
    const provider = await setup('s1')
    act(() => provider.latest()?.addUserMessage('hello'))
    const messages = provider.latest()?.messages ?? []
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(messages[0].blocks[0].type === 'user' && messages[0].blocks[0].content).toBe('hello')
  })

  it('reset clears messages and streaming state', async () => {
    const provider = await setup('s1')
    provider.emit(envelope('s1', event('message_start', { role: 'assistant', messageId: 'a1' })))
    act(() => provider.latest()?.reset())
    expect(provider.latest()?.messages).toHaveLength(0)
    expect(provider.latest()?.isStreaming).toBe(false)
  })

  it('resets when sessionId changes', async () => {
    const provider = await setup('s1')
    provider.emit(envelope('s1', event('message_start', { role: 'assistant', messageId: 'a1' })))
    expect(provider.latest()?.messages).toHaveLength(1)
    provider.rerender('s2')
    expect(provider.latest()?.messages).toHaveLength(0)
  })

  it('setAnchorToBottom flips the anchor', async () => {
    const provider = await setup('s1')
    expect(provider.latest()?.anchorToBottom).toBe(true)
    act(() => provider.latest()?.setAnchorToBottom(false))
    expect(provider.latest()?.anchorToBottom).toBe(false)
  })
})
