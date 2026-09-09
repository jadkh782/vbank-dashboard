import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config'
import { chunk } from '../log'

let client: SupabaseClient | null = null

/** Service-role client: bypasses RLS. Lives only in this worker. */
export function db(): SupabaseClient {
  if (!client) {
    const c = config()
    client = createClient(c.supabaseUrl, c.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

export class DbError extends Error {}

export function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new DbError(`${what}: ${res.error.message}`)
  return res.data
}

/** Upsert in chunks of 500 (PostgREST payload limits, and readable progress). */
export async function upsertChunked<T extends object>(table: string, rows: T[], onConflict: string): Promise<number> {
  let n = 0
  for (const part of chunk(rows, 500)) {
    check(await db().from(table).upsert(part, { onConflict, ignoreDuplicates: false }), `upsert ${table}`)
    n += part.length
  }
  return n
}

/** `select … where <col> in (…)` in chunks (URL length). */
export async function selectIn<T>(table: string, columns: string, col: string, values: (string | number)[]): Promise<T[]> {
  const out: T[] = []
  for (const part of chunk(values, 200)) {
    const data = check(await db().from(table).select(columns).in(col, part), `select ${table}`) as T[] | null
    if (data) out.push(...data)
  }
  return out
}
