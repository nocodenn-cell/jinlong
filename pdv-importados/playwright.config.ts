import { defineConfig, devices } from '@playwright/test'

/** Porta dedicada aos E2E para não colidir com `npm run dev` em :3000. */
const e2ePort = process.env.PLAYWRIGHT_TEST_PORT ?? '3009'
const defaultBase = `http://localhost:${e2ePort}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? defaultBase,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.CI
    ? undefined
    : {
        command: `npx next dev -p ${e2ePort}`,
        url: defaultBase,
        // Evita servidor antigo sem o middleware atual (defina PLAYWRIGHT_REUSE_SERVER=1 para reutilizar)
        reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
        timeout: 120_000,
      },
})
