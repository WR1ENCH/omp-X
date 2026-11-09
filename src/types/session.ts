import type { SessionInfo } from './ipc'

export type SessionStatus = 'starting' | 'ready' | 'busy' | 'settled' | 'closed' | 'error'

export interface SessionSummary {
  id: string
  title: string
  cwd: string
  status: SessionStatus
  createdAt: number
  updatedAt: number
  alive: boolean
}

export function sessionTitleFromCwd(cwd: string): string {
  if (!cwd) return 'Untitled session'
  const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || cwd
}

export function toSessionSummary(info: SessionInfo): SessionSummary {
  return {
    id: info.id,
    title: sessionTitleFromCwd(info.cwd),
    cwd: info.cwd,
    status: info.alive ? 'ready' : 'closed',
    createdAt: info.createdAt,
    updatedAt: info.createdAt,
    alive: info.alive,
  }
}
