// Build the dashboard in demo mode and deploy it as a prebuilt static site to
// the Vercel project `vbank-dashboard-demo` (public showcase, no backend).
//   npm run deploy:demo         (needs `npx vercel login` once per machine)
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const app = join(process.cwd(), 'apps', 'dashboard')
const out = join(process.cwd(), '.deploy-demo')
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, VITE_DEMO_DEFAULT: 'true' } })

run('npx vite build', app)
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, '.vercel', 'output', 'static'), { recursive: true })
cpSync(join(app, 'dist'), join(out, '.vercel', 'output', 'static'), { recursive: true })
rmSync(join(out, '.vercel', 'output', 'static', 'vercel.json'), { force: true })
writeFileSync(
  join(out, '.vercel', 'project.json'),
  JSON.stringify({ projectId: 'prj_Cz1zPz9hpFAA6nkZwymtRo0sglqk', orgId: 'team_BZb58BfUPR0jThpvoTfljbRP', projectName: 'vbank-dashboard-demo' }),
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
console.log('\nLive: https://vbank-dashboard-demo.vercel.app')
