import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './i18n/en.json'
import zhCN from './i18n/zh-CN.json'

const resources = {
  en: { translation: en },
  'zh-CN': { translation: zhCN },
}

export default i18n.use(initReactI18next).init({
  resources,
  lng: navigator.language.startsWith('zh') ? 'zh-CN' : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})