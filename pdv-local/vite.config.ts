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
  },
  resolve: {
    alias: {
      // Domínio compartilhado com o Next (`pdv-importados/core`) — pricing, tipos de carrinho, sync.
      '@core': resolve(__dirname, '../pdv-importados/core'),
    },
  },
})

