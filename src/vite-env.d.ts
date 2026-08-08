/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UIPATH_ORG?: string
  readonly VITE_UIPATH_TENANT?: string
  readonly VITE_UIPATH_PAT?: string
  readonly VITE_UIPATH_CLIENT_ID?: string
  readonly VITE_UIPATH_CLIENT_SECRET?: string
  readonly VITE_UIPATH_SCOPES?: string
  readonly VITE_UIPATH_BASE_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
