import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// No proxy any more: the dashboard talks to Supabase only (or runs on demo data).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173, host: true, allowedHosts: true },
})
