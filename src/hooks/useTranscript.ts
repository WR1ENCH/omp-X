import { useCallback, useEffect, useRef, useState } from 'react'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import {
  AssistantBlock,
  Message,
  TranscriptState,
  ToolCallBlock,
  estimateMessageHeight,
} from '@/types/transcript'

const STREAMING_CHUNK_MAX_MS = 16

export function useTranscript(sessionId: string | null) {
  const [state, setState] = useState<TranscriptState>({
    messages: [],
    currentStreamingMessageId: null,
    isStreaming: false,
    anchorToBottom: true,
    pendingToolCalls: new Map(),
  })

  const streamingBufferRef = useRef<string>('')
  const streamingTimeoutRef = useRef<number | null>(null)
  const unlistenRef = useRef<UnlistenFn | null>(null)

  const flushStreamingBuffer = useCallback(() => {
    setState((prev) => {
      if (!prev.currentStreamingMessageId) return prev
      const message = prev.messages.find((m) => m.id === prev.currentStreamingMessageId)
      if (!message) return prev

      const assistantBlock = message.blocks.find(
        (b): b is AssistantBlock => b.type === 'assistant' && b.streaming
      )
      if (!assistantBlock) return prev

      const newContent = assistantBlock.content + streamingBufferRef.current
      streamingBufferRef.current = ''

      return {
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === prev.currentStreamingMessageId
            ? {
                ...m,
                blocks: m.blocks.map((b) =>
                  b.id === assistantBlock.id
                    ? { ...b, content: newContent }
                    : b
                ),
              }
            : m
        ),
      }
    })
  }, [])

  const appendStreamingChunk = useCallback((chunk: string) => {
    streamingBufferRef.current += chunk

    if (streamingTimeoutRef.current) {
      clearTimeout(streamingTimeoutRef.current)
    }
    streamingTimeoutRef.current = window.setTimeout(flushStreamingBuffer, STREAMING_CHUNK_MAX_MS)
  }, [flushStreamingBuffer])

  const handleEvent = useCallback((event: { payload: unknown }) => {
    const payload = event.payload as {
      type: string
      session_id: string
      request_id?: string
      delta?: string
      tool?: string
      args?: Record<string, unknown>
      result?: unknown
      error?: string
      success?: boolean
      worktree_id?: string
      kind?: string
      details?: Record<string, unknown>
      diff?: string
      code?: number
      message?: string
      event?: { type: string; payload: unknown }
    }

    if (payload.session_id !== sessionId) return

    switch (payload.type) {
      case 'PromptQueued':
        setState((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: payload.request_id || crypto.randomUUID(),
              role: 'assistant',
              blocks: [
                {
                  id: crypto.randomUUID(),
                  type: 'assistant',
                  timestamp: Date.now(),
                  content: '',
                  streaming: true,
                },
              ],
              timestamp: Date.now(),
              sessionId: payload.session_id,
            },
          ],
          currentStreamingMessageId: payload.request_id || crypto.randomUUID(),
          isStreaming: true,
        }))
        break

      case 'TokenStream':
        appendStreamingChunk(payload.delta || '')
        break

      case 'ToolCallRequested': {
        const toolCallId = payload.request_id || crypto.randomUUID()
        const toolCallBlock: ToolCallBlock = {
          id: crypto.randomUUID(),
          type: 'tool-call',
          timestamp: Date.now(),
          toolName: payload.tool || 'unknown',
          toolCallId,
          args: payload.args || {},
          status: 'pending',
        }
        setState((prev) => {
          const message = prev.messages.find((m) => m.id === prev.currentStreamingMessageId)
          if (!message) return prev
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === prev.currentStreamingMessageId
                ? { ...m, blocks: [...m.blocks, toolCallBlock] }
                : m
            ),
            pendingToolCalls: new Map(prev.pendingToolCalls).set(toolCallId, toolCallBlock),
          }
        })
        break
      }

      case 'ToolCallResult': {
        const { request_id: toolCallId, result, success } = payload
        setState((prev) => {
          const pending = prev.pendingToolCalls.get(toolCallId || '')
          if (!pending) return prev

          const updatedToolCall: ToolCallBlock = {
            ...pending,
            status: success ? 'completed' : 'failed',
            result,
            error: success ? undefined : String(result),
          }
          const newPending = new Map(prev.pendingToolCalls)
          newPending.set(toolCallId || '', updatedToolCall)

          return {
            ...prev,
            messages: prev.messages.map((m) => ({
              ...m,
              blocks: m.blocks.map((b) =>
                b.type === 'tool-call' && b.toolCallId === toolCallId ? updatedToolCall : b
              ),
            })),
            pendingToolCalls: newPending,
          }
        })
        break
      }

      case 'MessageEnd':
        setState((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === prev.currentStreamingMessageId
              ? {
                  ...m,
                  blocks: m.blocks.map((b) =>
                    b.type === 'assistant' && b.streaming ? { ...b, streaming: false } : b
                  ),
                }
              : m
          ),
          currentStreamingMessageId: null,
          isStreaming: false,
        }))
        streamingBufferRef.current = ''
        if (streamingTimeoutRef.current) {
          clearTimeout(streamingTimeoutRef.current)
          streamingTimeoutRef.current = null
        }
        break

      case 'SessionStarted':
        setState((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: crypto.randomUUID(),
              role: 'system',
              blocks: [
                {
                  id: crypto.randomUUID(),
                  type: 'system',
                  timestamp: Date.now(),
                  event: 'session_start',
                  message: `Session started in worktree ${payload.worktree_id || ''}`,
                },
              ],
              timestamp: Date.now(),
              sessionId: payload.session_id,
            },
          ],
        }))
        break

      case 'SessionExited':
        setState((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: crypto.randomUUID(),
              role: 'system',
              blocks: [
                {
                  id: crypto.randomUUID(),
                  type: 'system',
                  timestamp: Date.now(),
                  event: 'session_end',
                  message: `Session exited${payload.code !== undefined ? ` (code ${payload.code})` : ''}`,
                },
              ],
              timestamp: Date.now(),
              sessionId: payload.session_id,
            },
          ],
          isStreaming: false,
          currentStreamingMessageId: null,
        }))
        break

      case 'SessionError':
        setState((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: crypto.randomUUID(),
              role: 'system',
              blocks: [
                {
                  id: crypto.randomUUID(),
                  type: 'system',
                  timestamp: Date.now(),
                  event: 'error',
                  message: payload.error || 'Unknown error',
                },
              ],
              timestamp: Date.now(),
              sessionId: payload.session_id,
            },
          ],
        }))
        break

      case 'ApprovalRequested':
      case 'DiffProposed':
      case 'HostEvent':
        break

      default:
        break
    }
  }, [sessionId, appendStreamingChunk])

  useEffect(() => {
    if (!sessionId) return

    const setupListener = async () => {
      unlistenRef.current = await listen('omp://event', handleEvent)
    }
    setupListener()

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current)
      }
    }
  }, [sessionId, handleEvent])

  const addUserMessage = useCallback((content: string) => {
    const message: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      blocks: [
        {
          id: crypto.randomUUID(),
          type: 'user',
          timestamp: Date.now(),
          content,
        },
      ],
      timestamp: Date.now(),
      sessionId: sessionId || '',
    }
    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, message],
      anchorToBottom: true,
    }))
  }, [sessionId])

  const setAnchorToBottom = useCallback((anchor: boolean) => {
    setState((prev) => ({ ...prev, anchorToBottom: anchor }))
  }, [])

  const getTotalHeight = useCallback(() => {
    return state.messages.reduce((sum, m) => sum + estimateMessageHeight(m), 0)
  }, [state.messages])

  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    anchorToBottom: state.anchorToBottom,
    addUserMessage,
    setAnchorToBottom,
    getTotalHeight,
    pendingToolCalls: state.pendingToolCalls,
  }
}