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
    server: {
      fs: {
        allow: [path.join(__dirname, '..')],
      },
    },
    test: {
      setupFiles: [path.join(__dirname, '../shared/vitest-localstorage-polyfill.ts')],
      environment: 'node',
      include: [
        'core/**/*.test.ts',
        'lib/**/*.test.ts',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'app/**/*.test.ts',
        'app/**/*.test.tsx',
        '../shared-core/src/**/*.test.ts',
      ],
      // Testes de integração que exigem Next.js request scope (cookies()) e Supabase real.
      // Devem rodar via Playwright (`test:e2e:critical`), não via Vitest.
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.next/**',
        'app/caixa/server/vendaConsistency.test.ts',
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
        { find: '@shared', replacement: path.resolve(__dirname, '../shared') },
        { find: '@', replacement: path.resolve(__dirname, './') },
        { find: '@/shared', replacement: path.resolve(__dirname, './shared') },
      ],
    },
  }
})
