export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeState {
  mode: ThemeMode
  resolved: 'light' | 'dark'
}

export const DEFAULT_THEME_STATE: ThemeState = {
  mode: 'system',
  resolved: 'dark',
}