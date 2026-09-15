// The commands behind the CLI: daily, backfill, check, catalog, serve.

import { addDays, berlinDay, berlinDayEnd, berlinDayStart, todayBerlin } from '@vbank/shared'
import { config, orchestratorConfigured } from '../config'
import { log, sleep } from '../log'
import { claimRequest, finishRequest, getState, setState } from '../db/repo'
import { getToken } from '../orchestrator/http'
import { countJobs, fetchFolders, fetchQueueDefs } from '../orchestrator/queries'
import { probeSelectVariant } from '../orchestrator/select'
import { syncCatalog } from '../pipeline/catalog'
import { resuggestOpen } from '../pipeline/resuggest'
import { runWindow, type RunResult } from './run'

const MAX_CATCHUP_DAYS = 14

/**
 * Yesterday and the lookback days, up to now. After an outage (VPN down, laptop
 * off) the window stretches back to the day before the last successful run,
 * capped at MAX_CATCHUP_DAYS, so gaps heal without a manual backfill.
 */
export async function runDaily(kind = 'daily'): Promise<RunResult> {
  const c = config()
  const today = todayBerlin()
  let fromDay = addDays(today, -c.lookbackDays)
  const lastOk = await lastSuccessfulRun()
  if (lastOk) {
    const catchUp = addDays(berlinDay(lastOk), -1)
    const floor = addDays(today, -MAX_CATCHUP_DAYS)
    if (catchUp < fromDay) fromDay = catchUp > floor ? catchUp : floor
  }
  return runWindow(kind, berlinDayStart(fromDay), new Date())
}

async function lastSuccessfulRun(): Promise<Date | null> {
  const stamps = await Promise.all(['daily', 'on_demand', 'backfill'].map((k) => getState<{ at: string }>(`last_${k}_ok`)))
  const times = stamps.filter((s): s is { at: string } => !!s?.at).map((s) => new Date(s.at).getTime())
  return times.length ? new Date(Math.max(...times)) : null
}

/**
 * Single shot for Task Scheduler instead of `serve`: process queued requests,
 * run the daily fetch if it is due and has not succeeded today, then exit.
 */
export async function runOnce(): Promise<void> {
  const c = config()
  const now = new Date()
  const today = todayBerlin(now)
  await setState('heartbeat', { at: now.toISOString(), pid: process.pid, mode: 'once' })
  for (let i = 0; i < 5; i++) {
    const req = await claimRequest()
    if (!req) break
    await handleRequest(req)
  }
  const dueAt = new Date(berlinDayStart(today).getTime() + (c.dailyAt.hour * 60 + c.dailyAt.minute) * 60_000)
  const last = await getState<{ at: string }>('last_daily_ok')
  const doneToday = !!last && berlinDay(last.at) === today && new Date(last.at) >= dueAt
  if (now >= dueAt && !doneToday) await runDaily()
  else log.info(`once: daily ${doneToday ? 'already done today' : 'not due yet'}`)
}

async function handleRequest(req: { id: number; kind: string; params: Record<string, unknown> }): Promise<void> {
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
      if (req) await handleRequest(req)
    } catch (e) {
      log.error(`serve loop: ${(e as Error).message}`)
    }
    await sleep(c.pollMs)
  }
}
