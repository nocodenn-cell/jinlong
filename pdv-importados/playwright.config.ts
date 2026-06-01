import { defineConfig, devices } from '@playwright/test'
import { getE2eBaseUrl, getE2eTestPort } from './e2e/helpers/url'

/**
 * Porta do `webServer` / `baseURL` quando não há `PLAYWRIGHT_BASE_URL`.
 * Padrão **3000** = mesmo `npm run dev`; fora do CI, `reuseExistingServer` evita um segundo `next dev`.
 * Isolado (dev em 3000 + E2E próprio): `PLAYWRIGHT_TEST_PORT=3009`.
 */
const e2ePort = getE2eTestPort()
const defaultBase = getE2eBaseUrl()
const baseURL = defaultBase

const isCi = process.env.CI === 'true'

/** No CI, sobe Next localmente quando `PLAYWRIGHT_E2E_WITH_DEV=1` (ver workflow opcional). */
const ciWithLocalServer =
  isCi && process.env.PLAYWRIGHT_E2E_WITH_DEV === '1'

/**
 * Se a URL do `webServer` já responder, não executa `command` (reutiliza `localhost:${e2ePort}`).
 * `PLAYWRIGHT_REUSE_SERVER=0`: sempre tenta subir via `command` (útil para “sala limpa”; falha se porta ocupada).
 */
const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_SERVER === '0'
    ? false
    : !isCi || !ciWithLocalServer

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-chrome-pixel',
      use: { ...devices['Pixel 7'] },
      testMatch: ['**/e2e/admin-idioma.spec.ts', '**/e2e/gerente.spec.ts'],
    },
    {
      name: 'mobile-safari-iphone',
      use: { ...devices['iPhone 14'] },
      testMatch: ['**/e2e/admin-idioma.spec.ts', '**/e2e/gerente.spec.ts'],
    },
  ],
  webServer:
    ciWithLocalServer || !isCi
      ? {
          command: `npx next dev -p ${e2ePort}`,
          url: defaultBase,
          reuseExistingServer,
          timeout: 120_000,
        }
      : undefined,
})
