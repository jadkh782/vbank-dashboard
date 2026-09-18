import { useQuery } from '@tanstack/react-query'
import type { Category, ErrorKind } from '@vbank/shared'
import { supabase } from '../auth/supabase'
import type { ReviewStatus } from './types'

/** What to look up: a family, or one exact normalised message. */
export type CaseSelector = { kind: ErrorKind; family_key: string; message_norm?: undefined } | { kind: ErrorKind; message_norm: string; family_key?: undefined }

export interface FamilyCase {
  id: number
  source: 'job' | 'transaction'
  automation_id: string
  business_day: string
  time: string
  /** Job state or final queue-item status. */
  status: string
  /** Raw text as the robot wrote it (job cause or exception reason). */
  raw: string | null
  review: { status: ReviewStatus; category: Category | null } | null
}

const LIMIT = 80

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data as T
}

/** The most recent cases behind one catalogue row, with their review state. */
export function useFamilyCases(sel: CaseSelector | null) {
  return useQuery({
    queryKey: ['family-cases', sel?.kind, sel?.family_key ?? null, sel?.message_norm ?? null],
    enabled: !!sel,
    queryFn: async (): Promise<FamilyCase[]> => {
      const s = sel!
      let cases: FamilyCase[]
      if (s.kind === 'job') {
        let q = supabase().from('jobs').select('id, automation_id, business_day, creation_time, state, cause, info').eq('state', 'Faulted')
        q = s.family_key !== undefined ? q.eq('family_key', s.family_key) : q.eq('info_norm', s.message_norm)
        const rows = unwrap(await q.order('creation_time', { ascending: false }).limit(LIMIT), 'jobs') as {
          id: number
          automation_id: string
          business_day: string
          creation_time: string
          state: string
          cause: string | null
          info: string | null
        }[]
        cases = rows.map((j) => ({ id: j.id, source: 'job', automation_id: j.automation_id, business_day: j.business_day, time: j.creation_time, status: j.state, raw: j.cause ?? j.info, review: null }))
      } else {
        let q = supabase().from('transactions').select('id, automation_id, business_day, first_creation_time, final_status, reason_raw').eq('kind', s.kind)
        q = s.family_key !== undefined ? q.eq('family_key', s.family_key) : q.eq('reason_norm', s.message_norm)
        const rows = unwrap(await q.order('first_creation_time', { ascending: false }).limit(LIMIT), 'transactions') as {
          id: number
          automation_id: string
          business_day: string
          first_creation_time: string
          final_status: string
          reason_raw: string | null
        }[]
        cases = rows.map((t) => ({ id: t.id, source: 'transaction', automation_id: t.automation_id, business_day: t.business_day, time: t.first_creation_time, status: t.final_status, raw: t.reason_raw, review: null }))
      }
      if (cases.length === 0) return cases
      const col = s.kind === 'job' ? 'job_id' : 'transaction_id'
      const items = unwrap(
        await supabase()
          .from('review_items')
          .select(`${col}, status, category`)
          .in(
            col,
            cases.map((c) => c.id),
          ),
        'review_items',
      ) as unknown as ({ status: ReviewStatus; category: Category | null } & Record<string, unknown>)[]
      const byId = new Map(items.map((i) => [i[col] as number, { status: i.status, category: i.category }]))
      for (const c of cases) c.review = byId.get(c.id) ?? null
      return cases
    },
  })
}
