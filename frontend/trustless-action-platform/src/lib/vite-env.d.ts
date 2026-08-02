/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PINATA_JWT: string
  readonly VITE_BACKEND_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}