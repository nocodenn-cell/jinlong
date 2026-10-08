import { defineConfig, devices } from '@playwright/test'

/**
 * Config isolada do site comercial (rotas públicas, sem Supabase, sem login).
 * Não altera `playwright.config.ts` do ERP. Só roda contra localhost.
 *   PLAYWRIGHT_SITE_URL=http://localhost:3010 npx playwright test -c playwright.site.config.ts
 */
const baseURL = process.env.PLAYWRIGHT_SITE_URL?.trim() || 'http://localhost:3000'

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(baseURL)) {
  throw new Error(`RECUSADO: o E2E do site só roda em localhost (recebido: ${baseURL}).`)
}

export default defineConfig({
  testDir: './e2e/site',
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
})
