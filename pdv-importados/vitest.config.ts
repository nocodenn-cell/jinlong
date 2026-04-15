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
    ],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
