// Shared storage for manually entered errors and dashboard settings.
// Backed by Supabase when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set
// (shared by everyone using the dashboard, locally and deployed); otherwise
// falls back to this browser's localStorage so the app works with zero setup.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export type ManualErrorCategory =
  | 'Server / Infrastructure'
  | 'IT system'
  | 'Machine / VM'
  | 'Network'
  | 'Other'

export const MANUAL_ERROR_CATEGORIES: ManualErrorCategory[] = [
  'Server / Infrastructure',
  'IT system',
  'Machine / VM',
  'Network',
  'Other',
]

export interface ManualError {
  id: string
  time: string // ISO — when the error occurred
  category: ManualErrorCategory
  process: string
  folder?: string
  description: string
  downtimeMinutes?: number
  reportedBy?: string
  createdAt: string
}

export interface DisplayInfo {
  name: string
  description?: string
}

export interface AppSettings {
  systemKeywords: string[]
  hoursPerPT: number
  humanMinutesPerItem: Record<string, number>
  licenseCapacity?: number
  /** Friendly names/descriptions for the stakeholder view, keyed by technical name. */
  displayInfo: Record<string, DisplayInfo>
  /** Success-rate thresholds (in %) for the stakeholder health status. */
  healthThresholds: { okMin: number; attentionMin: number }
}

export const DEFAULT_SETTINGS: AppSettings = {
  systemKeywords: [
    'server',
    'timeout',
    'connection',
    'network',
    'login',
    'unavailable',
    'remote',
    'disconnected',
    '502',
    '503',
    'crashed',
  ],
  hoursPerPT: 8,
  humanMinutesPerItem: {},
  displayInfo: {},
  healthThresholds: { okMin: 90, attentionMin: 75 },
}

// ── Backend selection ──────────────────────────────────────────────────────

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

export const storageMode: 'supabase' | 'local' = supabaseUrl && supabaseKey ? 'supabase' : 'local'

let supabase: SupabaseClient | null = null
if (storageMode === 'supabase') {
  supabase = createClient(supabaseUrl, supabaseKey)
}

// ── Manual errors ──────────────────────────────────────────────────────────

const LS_ERRORS = 'vbank-manual-errors'

interface ManualErrorRow {
  id: string
  time: string
  category: string
  process: string
  folder: string | null
  description: string
  downtime_minutes: number | null
  reported_by: string | null
  created_at: string
}

function rowToError(r: ManualErrorRow): ManualError {
  return {
    id: r.id,
    time: r.time,
    category: r.category as ManualErrorCategory,
    process: r.process,
    folder: r.folder ?? undefined,
    description: r.description,
    downtimeMinutes: r.downtime_minutes ?? undefined,
    reportedBy: r.reported_by ?? undefined,
    createdAt: r.created_at,
  }
}

function errorToRow(e: ManualError): ManualErrorRow {
  return {
    id: e.id,
    time: e.time,
    category: e.category,
    process: e.process,
    folder: e.folder ?? null,
    description: e.description,
    downtime_minutes: e.downtimeMinutes ?? null,
    reported_by: e.reportedBy ?? null,
    created_at: e.createdAt,
  }
}

function readLocalErrors(): ManualError[] {
  try {
    return JSON.parse(localStorage.getItem(LS_ERRORS) ?? '[]') as ManualError[]
  } catch {
    return []
  }
}

function writeLocalErrors(list: ManualError[]) {
  localStorage.setItem(LS_ERRORS, JSON.stringify(list))
}

async function listManualErrors(): Promise<ManualError[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('manual_errors')
      .select('*')
      .order('time', { ascending: false })
    if (error) throw new Error(`Supabase read failed: ${error.message}`)
    return (data as ManualErrorRow[]).map(rowToError)
  }
  return readLocalErrors().sort((a, b) => b.time.localeCompare(a.time))
}

async function upsertManualError(e: ManualError): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from('manual_errors').upsert(errorToRow(e))
    if (error) throw new Error(`Supabase write failed: ${error.message}`)
    return
  }
  const list = readLocalErrors().filter((x) => x.id !== e.id)
  list.push(e)
  writeLocalErrors(list)
}

async function deleteManualError(id: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from('manual_errors').delete().eq('id', id)
    if (error) throw new Error(`Supabase delete failed: ${error.message}`)
    return
  }
  writeLocalErrors(readLocalErrors().filter((x) => x.id !== id))
}

// ── Settings ───────────────────────────────────────────────────────────────

const LS_SETTINGS = 'vbank-settings'

async function getSettings(): Promise<AppSettings> {
  let stored: Partial<AppSettings> = {}
  if (supabase) {
    const { data, error } = await supabase.from('app_settings').select('data').eq('id', 1).maybeSingle()
    if (error) throw new Error(`Supabase settings read failed: ${error.message}`)
    stored = (data?.data as Partial<AppSettings>) ?? {}
  } else {
    try {
      stored = JSON.parse(localStorage.getItem(LS_SETTINGS) ?? '{}') as Partial<AppSettings>
    } catch {
      stored = {}
    }
  }
  return { ...DEFAULT_SETTINGS, ...stored }
}

async function saveSettings(s: AppSettings): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from('app_settings').upsert({ id: 1, data: s })
    if (error) throw new Error(`Supabase settings write failed: ${error.message}`)
    return
  }
  localStorage.setItem(LS_SETTINGS, JSON.stringify(s))
}

// ── React Query hooks ──────────────────────────────────────────────────────

export function useManualErrors() {
  return useQuery({ queryKey: ['manual-errors'], queryFn: listManualErrors })
}

export function useSaveManualError() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: upsertManualError,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manual-errors'] }),
  })
}

export function useDeleteManualError() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteManualError,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manual-errors'] }),
  })
}

export function useSettings() {
  return useQuery({ queryKey: ['app-settings'], queryFn: getSettings })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: saveSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-settings'] }),
  })
}
