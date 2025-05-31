/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORLDID_APP_ID: string
  readonly VITE_WORLDID_ACTION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 