import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTranscript } from '@/hooks/useTranscript'
import { sessionStore } from '@/lib/sessionStore'
import { ComposerState, ModelInfo, SlashCommand, Attachment } from '@/types/composer'

const AVAILABLE_MODELS_EVENT = 'omp:available-models'
const AVAILABLE_COMMANDS_EVENT = 'omp:available-commands'

export function useComposer(sessionId: string | null) {
  const { isStreaming, addUserMessage } = useTranscript()
  const [state, setState] = useState<ComposerState>({
    value: '',
    modelId: null,
    attachments: [],
    isRunning: false,
    showSlashMenu: false,
    slashQuery: '',
  })
  const [sendError, setSendError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /**
   * `isStreaming` is the single source of truth for the running state. `pending`
   * only covers the window between pressing send and the first stream event.
   */
  const isRunning = isStreaming || pending

  // Clear the optimistic `pending` flag as soon as the stream starts.
  const [previousStreaming, setPreviousStreaming] = useState(isStreaming)
  if (isStreaming !== previousStreaming) {
    setPreviousStreaming(isStreaming)
    if (isStreaming) setPending(false)
  }

  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [availableCommands, setAvailableCommands] = useState<SlashCommand[]>([])

  useEffect(() => {
    const handleModels = (e: CustomEvent) => {
      const models: ModelInfo[] = (e.detail || []).map((item: unknown): ModelInfo => {
        if (typeof item === 'string') return { id: item, name: item }
        const model = item as Partial<ModelInfo>
        const id = String(model.id ?? '')
        return {
          id,
          name: String(model.name ?? id),
          ...(typeof model.description === 'string' ? { description: model.description } : {}),
        }
      })
      setAvailableModels(models)
      setState((prev) => ({ ...prev, modelId: prev.modelId || models[0]?.id || null }))
    }
    const handleCommands = (e: CustomEvent) => {
      const commands: SlashCommand[] = (e.detail || []).map((item: unknown): SlashCommand => {
        if (typeof item === 'string') return { name: item, description: '' }
        const command = item as Partial<SlashCommand>
        return {
          name: String(command.name ?? ''),
          description: String(command.description ?? ''),
          ...(typeof command.category === 'string' ? { category: command.category } : {}),
        }
      })
      setAvailableCommands(commands)
    }

    window.addEventListener(AVAILABLE_MODELS_EVENT, handleModels as EventListener)
    window.addEventListener(AVAILABLE_COMMANDS_EVENT, handleCommands as EventListener)

    return () => {
      window.removeEventListener(AVAILABLE_MODELS_EVENT, handleModels as EventListener)
      window.removeEventListener(AVAILABLE_COMMANDS_EVENT, handleCommands as EventListener)
    }
  }, [])

  const sendPrompt = useCallback(async () => {
    const prompt = state.value
    if (!sessionId || !prompt.trim() || isRunning) return

    setSendError(null)
    setPending(true)
    addUserMessage(prompt)
    setState((prev) => ({ ...prev, value: '', isRunning: true }))

    try {
      await invoke('send_prompt', { sessionId, prompt })
      // The invoke resolved. If no stream has started by now, drop the
      // optimistic flag so a host that accepts the prompt but never streams
      // cannot leave the composer locked forever.
      if (!isStreaming) setPending(false)
    } catch (err) {
      console.error('[composer] send_prompt failed', err)
      setPending(false)
      setState((prev) => ({ ...prev, value: prompt, isRunning: false }))
      setSendError(err instanceof Error ? err.message : String(err))
    }
  }, [sessionId, state.value, isRunning, isStreaming, addUserMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) return
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void sendPrompt()
      }
    },
    [sendPrompt]
  )

  const triggerSlash = useCallback(() => {
    setState((prev) => ({ ...prev, showSlashMenu: true, slashQuery: '' }))
  }, [])

  const handleSlashInput = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === '/') {
      const target = e.target as HTMLTextAreaElement
      const cursorPos = target.selectionStart
      const textBeforeCursor = target.value.slice(0, cursorPos)
      const words = textBeforeCursor.split(/\s+/)
      const lastWord = words[words.length - 1]
      if (lastWord.startsWith('/') && lastWord.length === 1) {
        e.preventDefault()
        triggerSlash()
      }
    }
  }, [triggerSlash])

  const selectSlashCommand = useCallback(
    (command: SlashCommand) => {
      setState((prev) => {
        const newValue = prev.value.replace(/\/\w*$/, `/${command.name} `)
        return { ...prev, value: newValue, showSlashMenu: false }
      })
      textareaRef.current?.focus()
    },
    []
  )

  const selectModel = useCallback((modelId: string) => {
    setState((prev) => ({ ...prev, modelId }))
  }, [])

  const attachFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = () => {
      const files = Array.from(input.files || [])
      const attachments: Attachment[] = files.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type.startsWith('image/') ? 'image' : 'file',
        size: file.size,
        path: file.name,
      }))
      setState((prev) => ({
        ...prev,
        attachments: [...prev.attachments, ...attachments],
        value: prev.value + files.map((f) => `@${f.name}`).join(' '),
      }))
    }
    input.click()
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((a) => a.id !== id),
    }))
  }, [])

  const stop = useCallback(async () => {
    if (!sessionId) return
    setPending(false)
    setState((prev) => ({ ...prev, isRunning: false }))
    // Capture the working directory before abort: the host terminates the child
    // on abort (the protocol has no `cancel` yet, see review D7) and the
    // `session_closed` event drops the session from the store.
    const cwd = sessionStore.getState().sessions.find((s) => s.id === sessionId)?.cwd
    try {
      await invoke('abort', { sessionId })
      // The session is gone, so replace it with one in the same directory to
      // keep the composer usable instead of leaving it pointed at a dead host.
      await sessionStore.spawnSession(cwd)
    } catch (err) {
      console.error('[composer] abort failed', err)
      setSendError(err instanceof Error ? err.message : String(err))
    }
  }, [sessionId])

  const filteredCommands = useMemo(() => {
    if (!state.slashQuery) return availableCommands
    const q = state.slashQuery.toLowerCase()
    return availableCommands.filter(
      (cmd) => cmd.name.toLowerCase().includes(q) || cmd.description.toLowerCase().includes(q)
    )
  }, [availableCommands, state.slashQuery])

  return {
    state,
    setState,
    isRunning,
    sendError,
    clearError: () => setSendError(null),
    availableModels,
    availableCommands: filteredCommands,
    sendPrompt,
    handleKeyDown,
    handleSlashInput,
    triggerSlash,
    selectSlashCommand,
    selectModel,
    attachFile,
    removeAttachment,
    stop,
    textareaRef,
  }
}
