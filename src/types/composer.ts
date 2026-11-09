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

export interface Attachment {
  id: string
  name: string
  type: 'file' | 'image'
  size: number
  path: string
}

export interface ComposerState {
  value: string
  modelId: string | null
  attachments: Attachment[]
  isRunning: boolean
  showSlashMenu: boolean
  slashQuery: string
}