import { defineConfig } from 'vitest/config'

// One vitest run covers every package and app; each one brings its own
// vite/vitest config so environments (node vs. jsdom) stay local to it.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
})
