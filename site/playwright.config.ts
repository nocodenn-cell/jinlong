import { defineConfig, devices } from '@playwright/test'

/**
 * E2E do site comercial (app independente; sem banco, sem login).
 * Só roda contra localhost.
 *   npm run build && npm run start   (porta 3100)
 *   npm run test:e2e
 */
const baseURL = process.env.PLAYWRIGHT_SITE_URL?.trim() || 'http://localhost:3100'

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(baseURL)) {
  throw new Error(`RECUSADO: o E2E do site só roda em localhost (recebido: ${baseURL}).`)
}

export default defineConfig({
  testDir: './e2e',
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
