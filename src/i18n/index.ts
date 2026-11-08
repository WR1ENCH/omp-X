import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { storeGet, storeSave, storeSet } from '@/lib/store'
import en from './en.json'
import zhCN from './zh-CN.json'

const STORE_PATH = 'i18n.json'
const STORE_KEY = 'language'

const resources = {
  en: { translation: en },
  'zh-CN': { translation: zhCN },
}

type SupportedLanguage = keyof typeof resources

interface StoredLanguage {
  lng?: string
}

function isSupportedLanguage(value: string | undefined): value is SupportedLanguage {
  return !!value && value in resources
}

/**
 * Language preference is persisted through the store bridge. The previous
 * version called `plugin:store|get` without a resource id, so the stored
 * language was never read back.
 */
async function loadStoredLanguage(): Promise<SupportedLanguage> {
  try {
    const stored = await storeGet<StoredLanguage>(STORE_PATH, STORE_KEY)
    const storedLng = stored?.lng
    if (isSupportedLanguage(storedLng)) return storedLng
  } catch (err) {
    console.error('[i18n] failed to load language:', err)
  }
  return navigator.language.startsWith('zh') ? 'zh-CN' : 'en'
}

async function saveLanguage(lng: SupportedLanguage): Promise<void> {
  try {
    await storeSet(STORE_PATH, STORE_KEY, { lng })
    await storeSave(STORE_PATH)
  } catch (err) {
    console.error('[i18n] failed to save language:', err)
  }
}

export async function initI18n(): Promise<void> {
  const lng = await loadStoredLanguage()

  await i18n
    .use(initReactI18next)
    .init({
      resources,
      lng,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      detection: {
        order: [],
        caches: [],
      },
    })
}

export async function changeLanguage(lng: string): Promise<void> {
  if (!isSupportedLanguage(lng)) return
  await i18n.changeLanguage(lng)
  await saveLanguage(lng)
}

export { i18n }
export { useTranslation } from 'react-i18next'
