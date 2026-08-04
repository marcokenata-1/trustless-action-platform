/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PINATA_JWT: string
  readonly VITE_BACKEND_API_URL: string
  readonly VITE_INDEXER_URL: string
  readonly VITE_SIMULATOR_URL: string
  readonly VITE_MOVEMENT_ADDRESS: `0x${string}`
  readonly VITE_ATTENDANCE_VERIFIER_ADDRESS: `0x${string}`
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}