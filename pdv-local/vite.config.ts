import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    fs: {
      allow: [resolve(__dirname, '..')],
    },
  },
  test: {
    setupFiles: [resolve(__dirname, '../shared/vitest-localstorage-polyfill.ts')],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 1,
        functions: 1,
        branches: 1,
        statements: 1,
      },
    },
  },
  resolve: {
    alias: {
      // Domínio compartilhado em pacote dedicado do monorepo.
      '@core': resolve(__dirname, '../shared-core/src'),
      '@fastproduct/shared-core': resolve(__dirname, '../shared-core'),
      '@shared': resolve(__dirname, '../shared'),
    },
  },
})

