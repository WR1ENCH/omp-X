export type BlockType =
  | 'user'
  | 'assistant'
  | 'thinking'
  | 'tool-call'
  | 'tool-result'
  | 'system'

export interface BaseBlock {
  id: string
  type: BlockType
  timestamp: number
}

export interface UserBlock extends BaseBlock {
  type: 'user'
  content: string
}

export interface AssistantBlock extends BaseBlock {
  type: 'assistant'
  content: string
  streaming: boolean
  reasoning?: string
}

export interface ThinkingBlock extends BaseBlock {
  type: 'thinking'
  content: string
  collapsed: boolean
}

export interface ToolCallBlock extends BaseBlock {
  type: 'tool-call'
  toolName: string
  toolCallId: string
  args: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: unknown
  error?: string
}

export interface ToolResultBlock extends BaseBlock {
  type: 'tool-result'
  toolCallId: string
  toolName: string
  result: unknown
  isError: boolean
}

export interface SystemBlock extends BaseBlock {
  type: 'system'
  event: 'session_start' | 'session_end' | 'agent_start' | 'turn_start' | 'turn_end' | 'error' | 'info'
  message: string
  metadata?: Record<string, unknown>
}

export type Block =
  | UserBlock
  | AssistantBlock
  | ThinkingBlock
  | ToolCallBlock
  | ToolResultBlock
  | SystemBlock

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  blocks: Block[]
  timestamp: number
  sessionId: string
}

export interface TranscriptState {
  messages: Message[]
  currentStreamingMessageId: string | null
  isStreaming: boolean
  anchorToBottom: boolean
  pendingToolCalls: Map<string, ToolCallBlock>
}

export interface VirtualItem {
  index: number
  start: number
  end: number
  size: number
  message: Message
}

export const ESTIMATED_BLOCK_HEIGHTS: Record<BlockType, number> = {
  user: 80,
  assistant: 120,
  thinking: 60,
  'tool-call': 100,
  'tool-result': 100,
  system: 40,
}

export function estimateMessageHeight(message: Message): number {
  return message.blocks.reduce((sum, block) => sum + ESTIMATED_BLOCK_HEIGHTS[block.type], 40)
}