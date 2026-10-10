import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const sharedCoreDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  server: {
    fs: {
      allow: [path.join(sharedCoreDir, '..')],
    },
  },
  test: {
    environment: 'node',
    // `zustand/persist` chama `window.localStorage` ao avaliar o módulo.
    // Sem storage nesse instante o middleware retorna cedo e não monta
    // `api.persist`, então os testes não alcançam o `partialize` real.
    setupFiles: [path.join(sharedCoreDir, '../shared/vitest-localstorage-polyfill.ts')],
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
  },
})
