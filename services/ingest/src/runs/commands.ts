// The commands behind the CLI: daily, backfill, check, catalog, serve.

import { addDays, berlinDay, berlinDayEnd, berlinDayStart, todayBerlin } from '@vbank/shared'
import { config, orchestratorConfigured } from '../config'
import { log, sleep } from '../log'
import { claimRequest, finishRequest, setState } from '../db/repo'
import { getToken } from '../orchestrator/http'
import { countJobs, fetchFolders, fetchQueueDefs } from '../orchestrator/queries'
import { probeSelectVariant } from '../orchestrator/select'
import { syncCatalog } from '../pipeline/catalog'
import { resuggestOpen } from '../pipeline/resuggest'
import { runWindow, type RunResult } from './run'

/** Yesterday and the lookback days, up to now. */
export async function runDaily(kind = 'daily'): Promise<RunResult> {
  const c = config()
  const from = berlinDayStart(addDays(todayBerlin(), -c.lookbackDays))
  return runWindow(kind, from, new Date())
}

/** Whole days from `fromDay` to `toDay` in 7-day chunks; resumable by re-running. */
export async function runBackfill(fromDay: string, toDay: string): Promise<RunResult[]> {
  const results: RunResult[] = []
  for (let d = fromDay; d <= toDay; d = addDays(d, 7)) {
    const last = addDays(d, 6) < toDay ? addDays(d, 6) : toDay
    const to = new Date(Math.min(berlinDayEnd(last).getTime(), Date.now()))
    results.push(await runWindow('backfill', berlinDayStart(d), to))
  }
  return results
}

/** Connectivity + capabilities: token, folders, jobs, select variant, Supabase write. */
export async function runCheck(): Promise<boolean> {
  let ok = true
  const step = async (name: string, fn: () => Promise<string>) => {
    try {
      const detail = await fn()
      log.info(`✓ ${name}: ${detail}`)
    } catch (e) {
      ok = false
      log.error(`${name}: ${(e as Error).message}`)
    }
  }
  if (!orchestratorConfigured()) {
    log.error('ORCH_URL / CLIENT_ID / CLIENT_SECRET missing in .env')
    return false
  }
  await step('token', async () => `${(await getToken(true)).length} chars`)
  let folders: Awaited<ReturnType<typeof fetchFolders>> = []
  await step('folders', async () => `${(folders = await fetchFolders()).length} folders`)
  if (folders.length) {
    await step('jobs (7 days, first folder)', async () => `${await countJobs(folders[0].Id, new Date(Date.now() - 7 * 864e5))} jobs in ${folders[0].DisplayName}`)
    await step('queue item select variant', async () => {
      for (const f of folders) {
        if ((await fetchQueueDefs(f.Id)).length > 0) return `${await probeSelectVariant(f.Id)} (probed on ${f.DisplayName})`
      }
      return 'no folder with queues'
    })
  }
  await step('supabase write', async () => {
    await setState('check', { at: new Date().toISOString() })
    return 'ingest_state.check written'
  })
  log.info(ok ? 'All good.' : 'Some checks failed.')
  return ok
}

export async function runCatalog(): Promise<void> {
  const c = await syncCatalog()
  log.info(`${c.automations.length} automations known (${c.automations.filter((a) => a.is_new).length} new)`)
}

// ── serve: scheduler + request polling ──────────────────────────────────────
function nextDailyAt(now: Date): Date {
  const c = config()
  const today = todayBerlin(now)
  const at = (day: string) => new Date(berlinDayStart(day).getTime() + (c.dailyAt.hour * 60 + c.dailyAt.minute) * 60_000)
  const t = at(today)
  return t > now ? t : at(addDays(today, 1))
}

export async function serve(): Promise<never> {
  const c = config()
  log.info(`serve: daily at ${String(c.dailyAt.hour).padStart(2, '0')}:${String(c.dailyAt.minute).padStart(2, '0')} Europe/Berlin, polling requests every ${c.pollMs / 1000}s`)
  let nextRun = nextDailyAt(new Date())
  log.info(`next daily run: ${nextRun.toISOString()}`)
  for (;;) {
    const now = new Date()
    try {
      await setState('heartbeat', { at: now.toISOString(), pid: process.pid, nextRun: nextRun.toISOString() })

      if (now >= nextRun) {
        const res = await runDaily()
        const eight = new Date(berlinDayStart(todayBerlin(now)).getTime() + 8 * 3600_000)
        // Orchestrator unreachable (VPN down at night): retry every 30 minutes
        // until 08:00, then wait for tomorrow — the lookback repairs the gap.
        nextRun = res.status === 'failed' && now < eight ? new Date(now.getTime() + 30 * 60_000) : nextDailyAt(now)
        log.info(`next daily run: ${nextRun.toISOString()}`)
      }

      // on-demand requests from the Control Board
      const req = await claimRequest()
      if (req) {
        log.info(`request #${req.id} ${req.kind}`)
        try {
          let result: Record<string, unknown>
          if (req.kind === 'fetch_now') result = { ...(await runDaily('on_demand')) }
          else if (req.kind === 'backfill') {
            const p = req.params as { from?: string; to?: string }
            result = { runs: await runBackfill(p.from ?? addDays(todayBerlin(), -7), p.to ?? berlinDay(new Date())) }
          } else if (req.kind === 'catalog') {
            await runCatalog()
            result = { ok: true }
          } else if (req.kind === 'resuggest') {
            result = { ...(await resuggestOpen()) }
          } else result = { ignored: req.kind }
          await finishRequest(req.id, true, result)
        } catch (e) {
          await finishRequest(req.id, false, null, (e as Error).message)
        }
      }
    } catch (e) {
      log.error(`serve loop: ${(e as Error).message}`)
    }
    await sleep(c.pollMs)
  }
}
