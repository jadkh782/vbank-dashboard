// Build the dashboard and deploy it as a prebuilt static site to Vercel.
//   npm run deploy:demo        demo mode (VITE_DEMO_DEFAULT=true) → vbank-dashboard-demo
//   npm run deploy:dashboard   real mode (Supabase from apps/dashboard/.env) → vbank-dashboard
// Needs `npx vercel login` once per machine. Nothing is built on Vercel.
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const target = process.argv[2] === 'dashboard' ? 'dashboard' : 'demo'
const PROJECTS = {
  demo: { projectId: 'prj_Cz1zPz9hpFAA6nkZwymtRo0sglqk', projectName: 'vbank-dashboard-demo', url: 'https://vbank-dashboard-demo.vercel.app', demo: 'true' },
  dashboard: { projectId: 'prj_okFceoLCY4kOSahKMRUqjACJiGTY', projectName: 'vbank-dashboard', url: 'https://vbank-dashboard.vercel.app', demo: '' },
}
const p = PROJECTS[target]
const app = join(process.cwd(), 'apps', 'dashboard')
const out = join(process.cwd(), '.deploy-demo')
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, VITE_DEMO_DEFAULT: p.demo } })

run('npx vite build', app)
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, '.vercel', 'output', 'static'), { recursive: true })
cpSync(join(app, 'dist'), join(out, '.vercel', 'output', 'static'), { recursive: true })
rmSync(join(out, '.vercel', 'output', 'static', 'vercel.json'), { force: true })
writeFileSync(
  join(out, '.vercel', 'project.json'),
  JSON.stringify({ projectId: p.projectId, orgId: 'team_BZb58BfUPR0jThpvoTfljbRP', projectName: p.projectName }),
)
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
run('npx vercel deploy --prebuilt --prod --yes --non-interactive', out)
console.log(`
Live: ${p.url}`)
