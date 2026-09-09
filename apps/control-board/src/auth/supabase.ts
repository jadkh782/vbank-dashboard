import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/** The one Supabase client of the app (anon key; RLS decides what a user sees). */
export function supabase(): SupabaseClient {
  if (client) return client
  const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen in der .env dieser Anwendung.')
  }
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  return client
}
