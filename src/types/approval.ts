export interface ApprovalRequest {
  id: string
  method: 'select' | 'confirm' | 'input' | 'editor' | 'notify' | 'setStatus' | 'setWidget' | 'setTitle'
  title?: string
  options?: string[]
  extra?: Record<string, unknown>
  timestamp: number
}

export interface ApprovalResponse {
  id: string
  value: unknown
  cancelled?: boolean
}

export interface Toast {
  id: string
  type: 'info' | 'warning' | 'error'
  message: string
  duration?: number
  timestamp: number
}

export interface StatusItem {
  key: string
  text: string
  timestamp: number
}

export interface WidgetItem {
  widgetKey: string
  lines: string[]
  timestamp: number
}

export interface TitleItem {
  title: string
  timestamp: number
}