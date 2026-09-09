import type { Automation, DashboardSettings, ManualErrorRow, Run, Txn } from '@vbank/shared'

export interface WindowRows {
  runs: Run[]
  txns: Txn[]
  manualErrors: ManualErrorRow[]
}

/** Where the dashboard's rows come from. Chosen once at start-up. */
export interface DataSource {
  kind: 'demo' | 'supabase'
  /** Last published day (YYYY-MM-DD) or null when nothing is published yet. */
  datenstand(): Promise<string | null>
  automations(): Promise<Automation[]>
  settings(): Promise<DashboardSettings>
  /** Rows whose Berlin business day lies in [fromDay, toDay], inclusive. */
  rows(fromDay: string, toDay: string): Promise<WindowRows>
}

/**
 * `?demo` forces demo data; `?live` forces the real connection. Without either,
 * VITE_DEMO_DEFAULT=true (the demo deployment) makes demo data the default.
 * Nothing in the UI exposes this switch.
 */
export function isDemoMode(): boolean {
  const params = new URLSearchParams(window.location.search)
  if (params.has('demo')) return true
  if (params.has('live')) return false
  return /^(1|true|yes)$/i.test((import.meta.env.VITE_DEMO_DEFAULT ?? '').trim())
}

export async function createDataSource(): Promise<DataSource> {
  if (isDemoMode()) {
    const { demoSource } = await import('./demoSource')
    return demoSource()
  }
  const { supabaseSource } = await import('./supabaseSource')
  return supabaseSource()
}
