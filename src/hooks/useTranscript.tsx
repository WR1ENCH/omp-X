import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { FrontendEvent, ModelInfo, SlashCommand } from '@/types/ipc'
import type { Block, Message, SystemBlock, ToolCallBlock } from '@/types/transcript'

/**
 * Live tool-call state. Mirrors `ToolCallBlock` from `@/types/transcript`
 * (the type module is lead-owned and defines no `ToolCallState` alias).
 */
export type ToolCallState = ToolCallBlock

export interface PromptResultRecord {
  success: boolean
  status: string | null
  data: unknown
  timestamp: number
}

export interface TranscriptProviderState {
  messages: Message[]
  currentStreamingMessageId: string | null
  isStreaming: boolean
  anchorToBottom: boolean
  pendingToolCalls: Map<string, ToolCallState>
  lastPromptResult: PromptResultRecord | null
  lastError: string | null
  protocolVersion: number | null
  maxFrameBytes: number | null
  availableModels: ModelInfo[]
  availableCommands: SlashCommand[]
}

export interface TranscriptContextValue {
  messages: Message[]
  isStreaming: boolean
  anchorToBottom: boolean
  pendingToolCalls: Map<string, ToolCallState>
  setAnchorToBottom: (value: boolean) => void
  addUserMessage: (text: string) => void
  reset: () => void
}

const TranscriptContext = createContext<TranscriptContextValue | null>(null)

const EMPTY_DELTA: StreamDelta = { text: '', thinking: '' }

export interface StreamDelta {
  text: string
  thinking: string
}

const now = () => Date.now()
const uuid = () => crypto.randomUUID()

export function createInitialTranscriptState(): TranscriptProviderState {
  return {
    messages: [],
    currentStreamingMessageId: null,
    isStreaming: false,
    anchorToBottom: true,
    pendingToolCalls: new Map<string, ToolCallState>(),
    lastPromptResult: null,
    lastError: null,
    protocolVersion: null,
    maxFrameBytes: null,
    availableModels: [],
    availableCommands: [],
  }
}

/** Drop empty thinking blocks and mark assistant blocks as no longer streaming. */
function finalizeBlocks(blocks: Block[]): Block[] {
  const finalized: Block[] = []
  for (const block of blocks) {
    if (block.type === 'assistant') {
      finalized.push({ ...block, streaming: false })
    } else if (block.type === 'thinking') {
      if (block.content.trim().length > 0) finalized.push({ ...block, collapsed: true })
    } else {
      finalized.push(block)
    }
  }
  return finalized
}

/** Append a chunk to the block of `type`, creating it (in order) when missing. */
function appendBlockContent(blocks: Block[], type: 'assistant' | 'thinking', content: string): Block[] {
  const next = [...blocks]
  const index = next.findIndex((block) => block.type === type)
  if (index >= 0) {
    const existing = next[index]
    if (existing.type === type) {
      next[index] = { ...existing, content: existing.content + content }
    }
    return next
  }
  const created: Block =
    type === 'thinking'
      ? { id: uuid(), type: 'thinking', content, collapsed: false, timestamp: now() }
      : { id: uuid(), type: 'assistant', content, streaming: true, timestamp: now() }
  // Thinking must precede the assistant body it produced.
  const insertAt = next.findIndex((block) => block.type === 'assistant')
  if (insertAt >= 0) next.splice(insertAt, 0, created)
  else next.push(created)
  return next
}

/**
 * Pure reducer: fold buffered text/thinking chunks into the streaming message.
 * Returns the same state object when there is nothing to apply.
 */
export function applyStreamDelta(state: TranscriptProviderState, delta: StreamDelta): TranscriptProviderState {
  const targetId = state.currentStreamingMessageId
  if (!targetId) return state
  if (!delta.text && !delta.thinking) return state

  let changed = false
  const messages = state.messages.map((message) => {
    if (message.id !== targetId) return message
    let blocks = message.blocks
    if (delta.thinking) {
      blocks = appendBlockContent(blocks, 'thinking', delta.thinking)
      changed = true
    }
    if (delta.text) {
      blocks = appendBlockContent(blocks, 'assistant', delta.text)
      changed = true
    }
    return blocks === message.blocks ? message : { ...message, blocks }
  })

  return changed ? { ...state, messages } : state
}

/** Pure reducer: `message_start` opens the assistant message and starts streaming. */
export function applyMessageStart(
  state: TranscriptProviderState,
  event: FrontendEvent,
  sessionId: string | null,
): TranscriptProviderState {
  const messageId = typeof event.messageId === 'string' && event.messageId ? event.messageId : uuid()
  if (state.messages.some((message) => message.id === messageId)) return state

  let messages = state.messages
  // A new message supersedes any previous unfinished stream.
  if (state.currentStreamingMessageId && state.currentStreamingMessageId !== messageId) {
    messages = messages.map((message) =>
      message.id === state.currentStreamingMessageId
        ? { ...message, blocks: finalizeBlocks(message.blocks) }
        : message,
    )
  }

  const role: Message['role'] =
    event.role === 'user' ? 'user' : event.role === 'system' ? 'system' : 'assistant'
  const block: Block =
    role === 'user'
      ? { id: uuid(), type: 'user', content: '', timestamp: now() }
      : role === 'system'
        ? { id: uuid(), type: 'system', event: 'info', message: '', timestamp: now() }
        : { id: uuid(), type: 'assistant', content: '', streaming: true, timestamp: now() }
  const message: Message = {
    id: messageId,
    role,
    blocks: [block],
    timestamp: now(),
    sessionId: sessionId ?? '',
  }

  return {
    ...state,
    messages: [...messages, message],
    currentStreamingMessageId: messageId,
    isStreaming: true,
  }
}

/** Pure reducer: `message_end` finalizes only the matching message. */
export function applyMessageEnd(state: TranscriptProviderState, event: FrontendEvent): TranscriptProviderState {
  const targetId = event.messageId || state.currentStreamingMessageId
  if (!targetId) return { ...state, isStreaming: false }

  const messages = state.messages.map((message) =>
    message.id === targetId ? { ...message, blocks: finalizeBlocks(message.blocks) } : message,
  )
  const stillStreaming = messages.some(
    (message) =>
      message.id !== targetId &&
      message.blocks.some((block) => block.type === 'assistant' && block.streaming === true),
  )

  return {
    ...state,
    messages,
    currentStreamingMessageId: state.currentStreamingMessageId === targetId ? null : state.currentStreamingMessageId,
    isStreaming: stillStreaming,
  }
}

function eventBag(event: FrontendEvent): Record<string, unknown> {
  return { ...(event as unknown as Record<string, unknown>), ...(event.extra ?? {}) }
}

function pickString(bag: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = bag[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

function pickObject(bag: Record<string, unknown>, ...keys: string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = bag[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
  }
  return undefined
}

function targetMessageId(state: TranscriptProviderState): string {
  return state.currentStreamingMessageId ?? state.messages[state.messages.length - 1]?.id ?? uuid()
}

/** Pure reducer: `tool_execution_start` opens a pending tool card. */
export function applyToolExecutionStart(state: TranscriptProviderState, event: FrontendEvent): TranscriptProviderState {
  const bag = eventBag(event)
  const toolCallId = pickString(bag, 'toolCallId', 'tool_call_id', 'id') ?? uuid()
  const toolName = pickString(bag, 'name', 'toolName', 'tool_name', 'title') ?? 'unknown'
  const args = pickObject(bag, 'args', 'input', 'arguments') ?? {}

  const existing = state.pendingToolCalls.get(toolCallId)
  const pending: ToolCallBlock = existing
    ? { ...existing, toolName, args, status: 'pending' }
    : {
        id: uuid(),
        type: 'tool-call',
        toolName,
        toolCallId,
        args,
        status: 'pending',
        timestamp: now(),
      }

  const pendingToolCalls = new Map(state.pendingToolCalls)
  pendingToolCalls.set(toolCallId, pending)

  const messageId = targetMessageId(state)
  const messages = state.messages.map((message) => {
    if (message.id !== messageId) return message
    const blocks = message.blocks.filter(
      (block) => !(block.type === 'tool-call' && block.toolCallId === toolCallId),
    )
    return { ...message, blocks: [...blocks, pending] }
  })

  return { ...state, messages, pendingToolCalls }
}

/** Pure reducer: `tool_execution_end` settles a pending tool card. */
export function applyToolExecutionEnd(state: TranscriptProviderState, event: FrontendEvent): TranscriptProviderState {
  const bag = eventBag(event)
  const toolCallId = pickString(bag, 'toolCallId', 'tool_call_id', 'id')
  if (!toolCallId) return state

  const rawStatus = pickString(bag, 'status')
  const failed = rawStatus === 'error' || rawStatus === 'failed' || Boolean(pickString(bag, 'error'))
  const status: ToolCallBlock['status'] = failed ? 'failed' : 'completed'
  const result = bag.result ?? bag.output ?? bag.data
  const error = pickString(bag, 'error')
  const toolName = pickString(bag, 'name', 'toolName', 'tool_name') ?? 'unknown'

  const pendingToolCalls = new Map(state.pendingToolCalls)
  const existing = pendingToolCalls.get(toolCallId)
  pendingToolCalls.set(toolCallId, {
    ...(existing ?? {
      id: uuid(),
      type: 'tool-call' as const,
      toolName,
      toolCallId,
      args: {},
      timestamp: now(),
    }),
    toolName,
    status,
    result,
    error: error ?? (failed ? 'Tool execution failed' : undefined),
  })

  const messages = state.messages.map((message) => ({
    ...message,
    blocks: message.blocks.map((block) =>
      block.type === 'tool-call' && block.toolCallId === toolCallId
        ? { ...block, toolName, status, result, error: error ?? (failed ? 'Tool execution failed' : undefined) }
        : block,
    ),
  }))

  return { ...state, messages, pendingToolCalls }
}

/** Pure reducer: record `prompt_result`; surface failures in the transcript. */
export function applyPromptResult(
  state: TranscriptProviderState,
  event: FrontendEvent,
  sessionId: string | null,
): TranscriptProviderState {
  const success = event.success !== false
  const record: PromptResultRecord = {
    success,
    status: typeof event.status === 'string' ? event.status : null,
    data: event.data ?? null,
    timestamp: now(),
  }

  let next: TranscriptProviderState = { ...state, lastPromptResult: record }
  if (!success) {
    const block: SystemBlock = {
      id: uuid(),
      type: 'system',
      event: 'error',
      message: record.status || 'Prompt failed',
      timestamp: now(),
    }
    const message: Message = {
      id: uuid(),
      role: 'system',
      blocks: [block],
      timestamp: now(),
      sessionId: sessionId ?? '',
    }
    next = { ...next, messages: [...next.messages, message] }
  }
  return next
}

interface ParsedEventPayload {
  sessionId: string | null
  event: FrontendEvent
}

/**
 * Tolerate both the wrapped SessionEnvelope and (during the transition) an
 * unwrapped FrontendEvent. The envelope always wins when present.
 */
export function parseEventPayload(raw: unknown): ParsedEventPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  // Tauri's `listen` callback receives an Event wrapper; unwrap it so callers
  // can pass the raw callback argument without losing the payload.
  if (typeof record.event === 'string' && record.payload && typeof record.payload === 'object') {
    return parseEventPayload(record.payload)
  }
  if (typeof record.type === 'string') {
    return { sessionId: null, event: record as unknown as FrontendEvent }
  }
  if (typeof record.sessionId === 'string' && record.event && typeof record.event === 'object') {
    return { sessionId: record.sessionId, event: record.event as unknown as FrontendEvent }
  }
  return null
}

export function TranscriptProvider({
  sessionId,
  children,
}: {
  sessionId: string | null
  children: ReactNode
}): JSX.Element {
  const [state, setState] = useState<TranscriptProviderState>(createInitialTranscriptState)

  const bufferRef = useRef<StreamDelta>({ ...EMPTY_DELTA })
  const frameRef = useRef<number | null>(null)

  const cancelScheduledFlush = useCallback(() => {
    if (frameRef.current === null) return
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameRef.current)
    else clearTimeout(frameRef.current)
    frameRef.current = null
  }, [])

  /** Drain whatever has accumulated since the last frame. Idempotent. */
  const flushBuffer = useCallback(() => {
    frameRef.current = null
    const buffered = bufferRef.current
    bufferRef.current = { ...EMPTY_DELTA }
    if (!buffered.text && !buffered.thinking) return
    setState((prev) => applyStreamDelta(prev, buffered))
  }, [])

  /** Coalesce deltas into at most one state update per animation frame. */
  const scheduleFlush = useCallback(() => {
    if (frameRef.current !== null) return
    if (typeof requestAnimationFrame === 'function') {
      frameRef.current = requestAnimationFrame(() => flushBuffer())
    } else {
      frameRef.current = window.setTimeout(() => {
        frameRef.current = null
        flushBuffer()
      }, 16)
    }
  }, [flushBuffer])

  const handleEvent = useCallback(
    (raw: unknown) => {
      const parsed = parseEventPayload(raw)
      if (!parsed) return

      const { sessionId: envelopeSessionId, event } = parsed
      // Ignore events for another session. Unwrapped events carry no sessionId
      // and are accepted (they can only be intended for the active session).
      if (envelopeSessionId !== null && envelopeSessionId !== sessionId) return

      switch (event.type) {
        case 'message_start':
          setState((prev) => applyMessageStart(prev, event, sessionId))
          return
        case 'message_delta': {
          const chunk = typeof event.delta === 'string' ? event.delta : ''
          if (!chunk) return
          if (event.kind === 'thinking') bufferRef.current.thinking += chunk
          else bufferRef.current.text += chunk
          scheduleFlush()
          return
        }
        case 'message_end':
          cancelScheduledFlush()
          flushBuffer()
          setState((prev) => applyMessageEnd(prev, event))
          return
        case 'turn_end':
        case 'agent_end':
          cancelScheduledFlush()
          flushBuffer()
          setState((prev) => ({ ...prev, isStreaming: false }))
          return
        case 'session_settled':
          cancelScheduledFlush()
          flushBuffer()
          setState((prev) => ({ ...prev, isStreaming: false }))
          window.dispatchEvent(new CustomEvent('omp:session-settled'))
          return
        case 'session_closed':
          cancelScheduledFlush()
          flushBuffer()
          setState((prev) => ({ ...prev, isStreaming: false }))
          // Let the session store drop the dead session so the sidebar stops
          // advertising it as alive. This provider owns the only Tauri
          // subscription, so the notification travels over a window event.
          window.dispatchEvent(new CustomEvent('omp:session-closed', { detail: { sessionId } }))
          return
        case 'prompt_result':
          setState((prev) => applyPromptResult(prev, event, sessionId))
          return
        case 'tool_execution_start':
          setState((prev) => applyToolExecutionStart(prev, event))
          return
        case 'tool_execution_end':
          setState((prev) => applyToolExecutionEnd(prev, event))
          return
        case 'ui_request': {
          const id = typeof event.id === 'string' && event.id ? event.id : uuid()
          window.dispatchEvent(
            new CustomEvent('omp:ui-request', {
              detail: {
                id,
                request: {
                  method: typeof event.method === 'string' ? event.method : '',
                  title: event.title,
                  options: event.options,
                  extra: event.extra ?? {},
                },
              },
            }),
          )
          return
        }
        case 'available_models': {
          const models: ModelInfo[] = Array.isArray(event.models) ? event.models : []
          setState((prev) => ({ ...prev, availableModels: models }))
          window.dispatchEvent(new CustomEvent('omp:available-models', { detail: models }))
          return
        }
        case 'available_commands': {
          const commands: SlashCommand[] = Array.isArray(event.commands)
            ? (event.commands as SlashCommand[])
            : []
          setState((prev) => ({ ...prev, availableCommands: commands }))
          window.dispatchEvent(new CustomEvent('omp:available-commands', { detail: commands }))
          return
        }
        case 'ready':
          setState((prev) => ({
            ...prev,
            protocolVersion: typeof event.protocolVersion === 'number' ? event.protocolVersion : null,
            maxFrameBytes: typeof event.maxFrameBytes === 'number' ? event.maxFrameBytes : null,
          }))
          return
        case 'error':
          console.error('[transcript] backend error:', event.message)
          setState((prev) => ({ ...prev, lastError: typeof event.message === 'string' ? event.message : '' }))
          return
        case 'noise':
        case 'agent_start':
        case 'turn_start':
        case 'response':
        default:
          return
      }
    },
    [cancelScheduledFlush, flushBuffer, scheduleFlush, sessionId],
  )

  const setAnchorToBottom = useCallback((value: boolean) => {
    setState((prev) => (prev.anchorToBottom === value ? prev : { ...prev, anchorToBottom: value }))
  }, [])

  const addUserMessage = useCallback((text: string) => {
    if (!text) return
    const message: Message = {
      id: uuid(),
      role: 'user',
      blocks: [{ id: uuid(), type: 'user', content: text, timestamp: now() }],
      timestamp: now(),
      sessionId: sessionId ?? '',
    }
    setState((prev) => ({ ...prev, messages: [...prev.messages, message] }))
  }, [sessionId])

  const reset = useCallback(() => {
    cancelScheduledFlush()
    bufferRef.current = { ...EMPTY_DELTA }
    setState(createInitialTranscriptState())
  }, [cancelScheduledFlush])

  // A new session starts from a clean transcript.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    reset()
  }, [sessionId, reset])

  // The provider owns the single `omp://event` subscription.
  useEffect(() => {
    if (!sessionId) return
    let active = true
    let unlisten: UnlistenFn | undefined

    const subscribe = async () => {
      try {
        const handler = await listen<unknown>('omp://event', (payload) => {
          if (active) handleEvent(payload)
        })
        if (!active) {
          handler?.()
          return
        }
        unlisten = handler
      } catch (error) {
        console.error('[transcript] failed to subscribe to omp://event', error)
      }
    }
    subscribe()

    return () => {
      active = false
      unlisten?.()
    }
  }, [sessionId, handleEvent])

  // Never leave a scheduled frame behind on unmount.
  useEffect(() => () => cancelScheduledFlush(), [cancelScheduledFlush])

  const value = useMemo<TranscriptContextValue>(
    () => ({
      messages: state.messages,
      isStreaming: state.isStreaming,
      anchorToBottom: state.anchorToBottom,
      pendingToolCalls: state.pendingToolCalls,
      setAnchorToBottom,
      addUserMessage,
      reset,
    }),
    [state, setAnchorToBottom, addUserMessage, reset],
  )

  return <TranscriptContext.Provider value={value}>{children}</TranscriptContext.Provider>
}

export function useTranscript(): TranscriptContextValue {
  const context = useContext(TranscriptContext)
  if (!context) throw new Error('useTranscript must be used within a TranscriptProvider')
  return context
}
