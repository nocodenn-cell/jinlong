import path from 'path'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

/** Config dedicada — testes *.integration.test.ts (Supabase real, fora do `npm test`). */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  return {
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'react',
    },
    test: {
      setupFiles: [path.join(__dirname, '../shared/vitest-localstorage-polyfill.ts')],
      environment: 'node',
      pool: 'forks',
      maxWorkers: 1,
      testTimeout: 30_000,
      include: ['app/**/*.integration.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
      globals: false,
    },
    resolve: {
      alias: [
        { find: '@/i18n', replacement: path.resolve(__dirname, 'src/lib/i18n') },
        { find: '@/idioma', replacement: path.resolve(__dirname, 'src/lib/idioma') },
        { find: '@shared-core', replacement: path.resolve(__dirname, '../shared-core') },
        { find: '@shared', replacement: path.resolve(__dirname, '../shared') },
        { find: '@', replacement: path.resolve(__dirname, './') },
        { find: '@/shared', replacement: path.resolve(__dirname, './shared') },
        { find: 'server-only', replacement: path.resolve(__dirname, 'test-assets/server-only-stub.ts') },
      ],
    },
  }
})
