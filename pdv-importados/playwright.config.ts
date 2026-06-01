import { defineConfig, devices } from '@playwright/test'

/**
 * Porta do `webServer` / `baseURL` quando não há `PLAYWRIGHT_BASE_URL`.
 * Padrão **3000** = mesmo `npm run dev`; fora do CI, `reuseExistingServer` evita um segundo `next dev`.
 * Isolado (dev em 3000 + E2E próprio): `PLAYWRIGHT_TEST_PORT=3009`.
 */
const e2ePort = process.env.PLAYWRIGHT_TEST_PORT ?? '3000'
const defaultBase = `http://localhost:${e2ePort}`

/**
 * `||` + trim em vez de `??`: no CI o secret `PLAYWRIGHT_BASE_URL` ausente é
 * injetado como string vazia (`''`), que `??` NÃO trata, deixando `baseURL`
 * vazia e fazendo `page.goto('/login')` falhar com "invalid URL".
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || defaultBase

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
