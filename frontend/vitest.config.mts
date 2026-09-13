import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    environment: 'node',
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8', reporter: ['text', 'json-summary'],
      include: ['lib/**/*.ts', 'app/api/**/route.ts'], exclude: ['lib/mock-data.ts'],
    },
  },
})
