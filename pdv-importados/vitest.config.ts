import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
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
})
