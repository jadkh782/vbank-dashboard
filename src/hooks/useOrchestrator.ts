import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getAuthConfig } from '../api/auth'
import { DEMO_FOLDERS, generateDemoData, isDemoMode } from '../api/demo'
import { fetchFolders, fetchTenantData } from '../api/endpoints'
import { useFilters } from '../state/FilterContext'

export function useAuthConfig() {
  return getAuthConfig()
}

export function useFolders() {
  const auth = getAuthConfig()
  const demo = isDemoMode()
  return useQuery({
    queryKey: ['folders', demo],
    queryFn: demo ? async () => DEMO_FOLDERS : fetchFolders,
    enabled: demo || auth.configured,
    staleTime: 10 * 60_000,
    retry: 1,
  })
}

/**
 * The single data query the whole dashboard hangs off. The window is fetched
 * doubled (previous equivalent period included) so pages can compute deltas;
 * consumers split it via lib/aggregate.
 */
export function useTenantData() {
  const auth = getAuthConfig()
  const { from, to, folderId, refreshMs } = useFilters()
  const folders = useFolders()

  const demo = isDemoMode()
  const query = useQuery({
    queryKey: ['tenant-data', demo, folderId, from.getTime(), to.getTime()],
    queryFn: demo
      ? async () => generateDemoData(folderId, from, to)
      : () => fetchTenantData(folders.data!, folderId, from, to),
    enabled: (demo || auth.configured) && !!folders.data,
    refetchInterval: refreshMs,
    placeholderData: keepPreviousData,
    retry: 1,
  })

  return { ...query, folders }
}
