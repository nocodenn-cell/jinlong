import path from 'path'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  // Carrega .env, .env.local, .env.[mode] e .env.[mode].local (sem filtro de prefixo).
  // Em CI, secrets reais já injetados em process.env têm prioridade — só preenche o que está vazio.
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
    server: {
      fs: {
        allow: [path.join(__dirname, '..')],
      },
    },
    test: {
      setupFiles: [path.join(__dirname, '../shared/vitest-localstorage-polyfill.ts')],
      environment: 'node',
      // `vi.resetModules()` + dynamic import falham sob alta paralelização (Windows/CI).
      pool: 'forks',
      maxWorkers: process.env.CI ? 1 : 4,
      testTimeout: 10_000,
      include: [
        'core/**/*.test.ts',
        'lib/**/*.test.ts',
        'lib/**/*.spec.ts',
        '../shared-core/src/pdv/invariants/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'app/**/*.test.ts',
        'app/**/*.test.tsx',
        'components/**/*.test.ts',
        'components/**/*.test.tsx',
        'hooks/**/*.test.ts',
        'hooks/**/*.test.tsx',
        'tests/**/*.test.ts',
        '../shared-core/src/**/*.test.ts',
      ],
      // Testes de integração que exigem Next.js request scope (cookies()) e Supabase real.
      // Devem rodar via Playwright (`npm run test:e2e:critical` na raiz ou neste workspace), não via Vitest.
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.next/**',
        'app/caixa/server/vendaConsistency.integration.test.ts',
        'app/caixa/server/cancelarVendaContrato.integration.test.ts',
      ],
      globals: false,
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
      alias: [
        { find: '@/i18n', replacement: path.resolve(__dirname, 'src/lib/i18n') },
        { find: '@/idioma', replacement: path.resolve(__dirname, 'src/lib/idioma') },
        // `@shared-core` antes de `@shared`/`@` (alias mais específico primeiro).
        { find: '@shared-core', replacement: path.resolve(__dirname, '../shared-core') },
        { find: '@shared', replacement: path.resolve(__dirname, '../shared') },
        { find: '@', replacement: path.resolve(__dirname, './') },
        { find: '@/shared', replacement: path.resolve(__dirname, './shared') },
        // `server-only` lança erro fora do bundle de servidor do Next; neutraliza em teste.
        { find: 'server-only', replacement: path.resolve(__dirname, 'test-assets/server-only-stub.ts') },
      ],
    },
  }
})
