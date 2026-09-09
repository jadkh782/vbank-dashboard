import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Category } from '@vbank/shared'
import { supabase } from '../auth/supabase'
import type { ManualErrorRow } from './types'

function unwrap<T>(res: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new Error(translate(res.error.message) || `${what}: ${res.error.message}`)
  return res.data as T
}

/** Postgres exception texts raised by our RPCs and triggers → German. */
export function translate(message: string): string | null {
  const m: Record<string, string> = {
    DAY_FROZEN: 'Der Tag ist veröffentlicht und gesperrt. Erst die Veröffentlichung zurücknehmen.',
    DAY_HAS_OPEN_ITEMS: 'Es gibt noch offene Punkte für diesen Tag.',
    DAY_INCOMPLETE: 'Der Tag wurde noch nicht vollständig abgerufen.',
    PREVIOUS_DAY_UNPUBLISHED: 'Ein früherer Tag ist noch nicht veröffentlicht — Tage werden in Reihenfolge veröffentlicht.',
    DAY_ALREADY_PUBLISHED: 'Der Tag ist bereits veröffentlicht.',
    DAY_NOT_PUBLISHED: 'Der Tag ist nicht veröffentlicht.',
    NOT_LATEST_PUBLISHED_DAY: 'Nur der zuletzt veröffentlichte Tag kann zurückgenommen werden.',
    REASON_REQUIRED: 'Bitte eine Begründung angeben.',
    FORBIDDEN: 'Keine Berechtigung.',
  }
  for (const [k, v] of Object.entries(m)) if (message.includes(k)) return v
  return null
}

/** Invalidate the queries a change touches; every mutation ends here. */
function useInvalidate() {
  const qc = useQueryClient()
  return (...keys: string[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })))
}

// ── Review ──────────────────────────────────────────────────────────────────
export function useConfirmItems() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async ({ ids, category }: { ids: number[]; category?: Category }) =>
      unwrap(await supabase().rpc('confirm_items', { ids, cat: category ?? null }), 'confirm_items') as number,
    onSettled: () => inv('day-review', 'days'),
  })
}

export function useSetCategory() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, category, note }: { id: number; category: Category; note?: string }) =>
      unwrap(await supabase().rpc('set_item_category', { item_id: id, cat: category, item_note: note ?? null }), 'set_item_category'),
    onSettled: () => inv('day-review', 'days', 'mapping-families', 'mapping-messages'),
  })
}

export function useReopenItem() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async (id: number) => unwrap(await supabase().rpc('reopen_item', { item_id: id }), 'reopen_item'),
    onSettled: () => inv('day-review', 'days'),
  })
}

export function useSaveNote() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) => unwrap(await supabase().from('review_items').update({ note }).eq('id', id), 'note'),
    onSettled: () => inv('day-review'),
  })
}

export function usePublishDay() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async (day: string) => unwrap(await supabase().rpc('publish_day', { d: day }), 'publish_day'),
    onSettled: () => inv('days', 'day-review'),
  })
}

export function useUnpublishDay() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async ({ day, reason }: { day: string; reason: string }) => unwrap(await supabase().rpc('unpublish_day', { d: day, reason }), 'unpublish_day'),
    onSettled: () => inv('days', 'day-review'),
  })
}

// ── Manual errors ───────────────────────────────────────────────────────────
export function useSaveManualError() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async (row: Omit<ManualErrorRow, 'id'> & { id?: string }) => unwrap(await supabase().from('manual_errors').upsert(row).select('id').single(), 'manual_errors'),
    onSettled: () => inv('manual-errors', 'days'),
  })
}

export function useDeleteManualError() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase().from('manual_errors').delete().eq('id', id), 'manual_errors'),
    onSettled: () => inv('manual-errors', 'days'),
  })
}

// ── Automations, settings, mappings, ingest ─────────────────────────────────
export function useUpdateAutomation() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; included?: boolean; is_new?: boolean; display_name?: string | null; display_description?: string | null; human_minutes_per_item?: number | null; comment?: string | null }) =>
      unwrap(await supabase().from('automations').update(patch).eq('id', id), 'automations'),
    onSettled: () => inv('automations'),
  })
}

export function useUpdateSettings() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => unwrap(await supabase().from('settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1), 'settings'),
    onSettled: () => inv('settings'),
  })
}

export function useUpsertFamilyMapping() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async (row: { kind: string; family_key: string; category: Category }) =>
      unwrap(await supabase().from('mapping_families').upsert({ ...row, source: 'decision', last_seen: new Date().toISOString() }, { onConflict: 'kind,family_key' }), 'mapping_families'),
    onSettled: () => inv('mapping-families'),
  })
}

export function useDeleteFamilyMapping() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async ({ kind, family_key }: { kind: string; family_key: string }) =>
      unwrap(await supabase().from('mapping_families').delete().eq('kind', kind).eq('family_key', family_key), 'mapping_families'),
    onSettled: () => inv('mapping-families'),
  })
}

export function useUpsertMessageMapping() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async (row: { kind: string; message_norm: string; category: Category }) =>
      unwrap(await supabase().from('mapping_messages').upsert({ ...row, source: 'decision' }, { onConflict: 'kind,message_norm' }), 'mapping_messages'),
    onSettled: () => inv('mapping-messages'),
  })
}

export function useRequestIngest() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: async ({ kind, params }: { kind: string; params?: Record<string, unknown> }) =>
      unwrap(await supabase().rpc('request_ingest', { kind, params: params ?? {} }), 'request_ingest') as number,
    onSettled: () => inv('ingest-requests'),
  })
}
