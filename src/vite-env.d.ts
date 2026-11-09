/// <reference types="vite/client" />
/// <reference types="@tauri-apps/api" />

interface ImportMetaEnv {
  readonly VITE_TAURI_PLATFORM: string
  readonly VITE_TAURI_DEBUG: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}