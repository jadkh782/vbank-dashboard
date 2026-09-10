// CLI:  npm run ingest -- <command>
//   check                      token · folders · jobs · select variant · Supabase write
//   catalog                    folders / processes / queues → automations
//   daily                      yesterday + lookback days, up to now
//   backfill --from D [--to D] whole days in 7-day chunks (YYYY-MM-DD)
//   import-workbook <xlsx> [--force] [--allow-mismatch]
//   resuggest                  recompute suggestions for every open review item
//   serve                      scheduler (daily at DAILY_AT Berlin) + request polling

import { addDays, todayBerlin } from '@vbank/shared'
import { log } from './log'
import { closeHttp } from './orchestrator/http'
import { runBackfill, runCatalog, runCheck, runDaily, serve } from './runs/commands'
import { resuggestOpen } from './pipeline/resuggest'
import { importWorkbook } from './tools/importWorkbook'

const [cmd, ...rest] = process.argv.slice(2)
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}
const has = (name: string) => rest.includes(`--${name}`)

async function main(): Promise<number> {
  switch (cmd) {
    case 'check':
      return (await runCheck()) ? 0 : 1
    case 'catalog':
      await runCatalog()
      return 0
    case 'daily': {
      const r = await runDaily()
      return r.status === 'failed' ? 1 : 0
    }
    case 'backfill': {
      const from = flag('from')
      if (!from) throw new Error('backfill needs --from YYYY-MM-DD')
      const to = flag('to') ?? addDays(todayBerlin(), 0)
      const results = await runBackfill(from, to)
      return results.some((r) => r.status === 'failed') ? 1 : 0
    }
    case 'import-workbook': {
      const path = rest.find((a) => !a.startsWith('--'))
      if (!path) throw new Error('import-workbook needs the xlsx path')
      await importWorkbook(path, { force: has('force'), allowMismatch: has('allow-mismatch') })
      await resuggestOpen() // decisions from the workbook reach every open item
      return 0
    }
    case 'resuggest':
      await resuggestOpen()
      return 0
    case 'serve':
      await serve()
      return 0
    default:
      log.error(`unknown command "${cmd ?? ''}" — use check | catalog | daily | backfill | import-workbook | resuggest | serve`)
      return 2
  }
}

main()
  .then(async (code) => {
    await closeHttp()
    process.exit(code)
  })
  .catch(async (e) => {
    log.error((e as Error).message)
    await closeHttp()
    process.exit(1)
  })
