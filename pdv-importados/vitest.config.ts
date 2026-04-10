import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
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
