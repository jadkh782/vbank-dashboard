// Build an app and deploy it as a prebuilt static site to Vercel (nothing is
// built on Vercel; the Build Output API skips install and build there).
//   npm run deploy:demo            apps/dashboard, demo mode  → vbank-dashboard-demo
//   npm run deploy:dashboard       apps/dashboard, Supabase   → vbank-dashboard
//   npm run deploy:control-board   apps/control-board         → vbank-control-board
// Needs `npx vercel login` once per machine (device flow in this shell:
// `vercel login --non-interactive`). The first deploy of a target creates the
// project via `vercel link`.
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TARGETS = {
  demo: { app: 'apps/dashboard', projectName: 'vbank-dashboard-demo', projectId: 'prj_Cz1zPz9hpFAA6nkZwymtRo0sglqk', url: 'https://vbank-dashboard-demo.vercel.app', env: { VITE_DEMO_DEFAULT: 'true' } },
  dashboard: { app: 'apps/dashboard', projectName: 'vbank-dashboard', projectId: 'prj_okFceoLCY4kOSahKMRUqjACJiGTY', url: 'https://vbank-dashboard.vercel.app', env: { VITE_DEMO_DEFAULT: '' } },
  'control-board': { app: 'apps/control-board', projectName: 'vbank-control-board', projectId: 'prj_6BSLCTAMFVj22JnNlt082ECouA09', url: 'https://vbank-control-board.vercel.app', env: {} },
}
const ORG_ID = 'team_BZb58BfUPR0jThpvoTfljbRP'

const target = TARGETS[process.argv[2]]
if (!target) {
  console.error(`usage: node scripts/deploy-vercel.mjs <${Object.keys(TARGETS).join('|')}>`)
  process.exit(2)
}

const app = join(process.cwd(), target.app)
const out = join(process.cwd(), '.deploy-vercel', process.argv[2])
const run = (cmd, cwd, env = {}) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } })

run('npx vite build', app, target.env)

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, '.vercel', 'output', 'static'), { recursive: true })
cpSync(join(app, 'dist'), join(out, '.vercel', 'output', 'static'), { recursive: true })
rmSync(join(out, '.vercel', 'output', 'static', 'vercel.json'), { force: true })
writeFileSync(
  join(out, '.vercel', 'output', 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/assets/(.*)', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html', headers: { 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } },
      ],
    },
    null,
    2,
  ),
)

// Link: known project id → write project.json; otherwise let the CLI create/link the project.
if (target.projectId) {
  writeFileSync(join(out, '.vercel', 'project.json'), JSON.stringify({ projectId: target.projectId, orgId: ORG_ID, projectName: target.projectName }))
} else {
  run(`npx vercel link --yes --project ${target.projectName} --non-interactive`, out)
  const linked = JSON.parse(readFileSync(join(out, '.vercel', 'project.json'), 'utf8'))
  console.log(`\nproject ${target.projectName} = ${linked.projectId} — put this id into TARGETS in scripts/deploy-vercel.mjs`)
}
if (!existsSync(join(out, '.vercel', 'project.json'))) throw new Error('vercel link did not produce .vercel/project.json')

run('npx vercel deploy --prebuilt --prod --yes --non-interactive', out)
console.log(`\nLive: ${target.url}`)
