import React from 'react'
import { createRoot } from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import App from './App'
import { LayoutStateProvider } from '@/hooks/useLayoutState'
import { useTheme } from '@/hooks/useTheme'
import { useShortcuts } from '@/hooks/useShortcuts'
import { initI18n } from './i18n'
import './tokens.css'

// i18next must be initialised before any component calls useTranslation(),
// otherwise `t()` returns the raw key (e.g. "composer.placeholder").
initI18n().catch((err) => {
  console.error('Failed to initialise i18n:', err)
})

function ThemeInitializer() {
  const { t } = useTranslation()
  const { ready } = useTheme()
  useShortcuts()
  if (!ready) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[var(--bg-base)]">
        <div className="text-[var(--fg-muted)]">{t('common.loading')}</div>
      </div>
    )
  }
  return <App />
}

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

createRoot(container).render(
  <React.StrictMode>
    <LayoutStateProvider>
      <ThemeInitializer />
    </LayoutStateProvider>
  </React.StrictMode>
)
