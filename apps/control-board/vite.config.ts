import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  // Bound to the VPN machine; reached through a private port forward only.
  preview: { port: 4174, host: true, allowedHosts: true },
})
