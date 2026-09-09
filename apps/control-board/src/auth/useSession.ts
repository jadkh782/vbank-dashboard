import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

export type Role = 'viewer' | 'reviewer' | 'admin'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const sb = supabase()
    void sb.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  return { session, loading }
}

/** The caller's role from `profiles` (RLS lets everyone read their own row). */
export function useRole(userId: string | undefined) {
  return useQuery({
    queryKey: ['role', userId],
    enabled: !!userId,
    staleTime: Infinity,
    queryFn: async (): Promise<Role | null> => {
      const { data, error } = await supabase().from('profiles').select('role').eq('user_id', userId!).maybeSingle<{ role: Role }>()
      if (error) throw new Error(error.message)
      return data?.role ?? null
    },
  })
}

export async function signOut() {
  await supabase().auth.signOut()
}
