import { useQuery } from '@tanstack/react-query'
import type { ErrorKind } from '@vbank/shared'
import { supabase } from '../auth/supabase'
import type { MappingFamilyRow, ReviewItemRow } from './types'

/** A family seen in open review items that the Fehlerkatalog does not know yet. */
export interface OpenFamily {
  kind: ErrorKind
  family_key: string
  /** Normalised message of the most recent item (job cause or transaction reason). */
  example: string
  count: number
  automations: string[]
  lastDay: string
  itemIds: number[]
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data as T
}

async function selectIn<T>(table: string, columns: string, values: number[]): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < values.length; i += 200) {
    out.push(...(unwrap(await supabase().from(table).select(columns).in('id', values.slice(i, i + 200)), table) as T[]))
  }
  return out
}

/**
 * Open review items grouped by (kind, family) minus what the catalogue already
 * maps — the list a reviewer works through to grow the Fehlerkatalog. Job
 * families come from the robot-log cause where the job message was generic.
 */
export function useOpenFamilies(known: MappingFamilyRow[] | undefined) {
  return useQuery({
    queryKey: ['open-families', known?.length ?? -1],
    enabled: !!known,
    queryFn: async (): Promise<OpenFamily[]> => {
      const items: ReviewItemRow[] = []
      for (let page = 0; ; page++) {
        const part = unwrap(
          await supabase().from('review_items').select('*').eq('status', 'open').order('business_day', { ascending: false }).range(page * 1000, page * 1000 + 999),
          'review_items',
        ) as ReviewItemRow[]
        items.push(...part)
        if (part.length < 1000) break
      }
      const txIds = items.map((i) => i.transaction_id).filter((x): x is number => x !== null)
      const jobIds = items.map((i) => i.job_id).filter((x): x is number => x !== null)
      const [txs, jobs] = await Promise.all([
        txIds.length ? selectIn<{ id: number; reason_norm: string | null; family_key: string | null }>('transactions', 'id, reason_norm, family_key', txIds) : [],
        jobIds.length ? selectIn<{ id: number; info_norm: string | null; family_key: string | null }>('jobs', 'id, info_norm, family_key', jobIds) : [],
      ])
      const tx = new Map(txs.map((t) => [t.id, t]))
      const jb = new Map(jobs.map((j) => [j.id, j]))
      const mapped = new Set((known ?? []).map((m) => `${m.kind}::${m.family_key}`))

      const groups = new Map<string, OpenFamily>()
      for (const i of items) {
        const src = i.transaction_id !== null ? tx.get(i.transaction_id) : i.job_id !== null ? jb.get(i.job_id) : undefined
        const family = src?.family_key
        if (!family) continue
        const k = `${i.kind}::${family}`
        if (mapped.has(k)) continue
        const message = src && 'reason_norm' in src ? src.reason_norm : src && 'info_norm' in src ? src.info_norm : null
        const g = groups.get(k)
        if (g) {
          g.count++
          g.itemIds.push(i.id)
          if (!g.automations.includes(i.automation_id)) g.automations.push(i.automation_id)
          if (i.business_day > g.lastDay) g.lastDay = i.business_day
        } else {
          groups.set(k, { kind: i.kind, family_key: family, example: message ?? family, count: 1, automations: [i.automation_id], lastDay: i.business_day, itemIds: [i.id] })
        }
      }
      return [...groups.values()].sort((a, b) => b.count - a.count)
    },
  })
}
