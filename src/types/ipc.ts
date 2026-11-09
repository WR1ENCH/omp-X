// Shared IPC contract types.
//
// This file is the single source of truth for payloads exchanged with the
// Rust backend. It must stay in sync with `crates/omp-tauri/src/commands.rs`
// and `crates/omp-tauri/src/events.rs`. See docs/m2/CONTRACT.md.

/** Result of `spawn_session`. */
export interface SpawnSessionResult {
  sessionId: string
  cwd: string
}

/** Item returned by `list_sessions`. */
export interface SessionInfo {
  id: string
  cwd: string
  alive: boolean
  createdAt: number
}

/** Result of `pty_spawn`. */
export interface PtySpawnResult {
  pid: number
}

/** Result of `pty_read` (fallback when events are lost). */
export interface PtyReadResult {
  pid: number
  data: string
  exited: boolean
}

export interface ModelInfo {
  id: string
  name: string
  description?: string
}

export interface SlashCommand {
  name: string
  description: string
  category?: string
}

/** `response` frames acknowledge a command we sent. */
export interface ResponseEvent {
  command: string
  success: boolean
  data?: unknown
  error?: string
}

export interface UiRequestPayload {
  id: string
  method: string
  title?: string
  options?: string[]
  extra: Record<string, unknown>
}

/**
 * Event payload emitted on the `omp://event` channel.
 * Rust serializes with `tag = "type"`, `rename_all = "snake_case"` and
 * `rename_all_fields = "camelCase"`, so every field below is camelCase.
 */
export interface FrontendEvent {
  type:
    | 'ready'
    | 'agent_start'
    | 'turn_start'
    | 'message_start'
    | 'message_delta'
    | 'message_end'
    | 'turn_end'
    | 'agent_end'
    | 'prompt_result'
    | 'available_commands'
    | 'available_models'
    | 'tool_execution_start'
    | 'tool_execution_end'
    | 'ui_request'
    | 'session_settled'
    | 'session_closed'
    | 'response'
    | 'noise'
    | 'error'
  protocolVersion?: number
  maxFrameBytes?: number
  role?: string
  messageId?: string
  kind?: 'text' | 'thinking'
  delta?: string
  id?: string
  method?: string
  title?: string
  options?: string[]
  extra?: Record<string, unknown>
  success?: boolean
  status?: string
  data?: unknown
  sessionSettled?: boolean
  commands?: unknown[]
  models?: ModelInfo[]
  toolCallId?: string
  name?: string
  args?: unknown
  result?: unknown
  error?: string
  text?: string
  message?: string
  code?: number
  reason?: string
}

/** Every session event is wrapped in an envelope carrying its session id. */
export interface SessionEnvelope {
  sessionId: string
  event: FrontendEvent
}

/** Event payload emitted on the `omp://pty` channel. */
export interface PtyEvent {
  type: 'data' | 'exit'
  pid: number
  data?: string
  code?: number
}
