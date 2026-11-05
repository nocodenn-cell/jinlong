import { defineConfig, devices } from '@playwright/test'

/**
 * E2E da validação operacional PDV-100 (Frente de Caixa), contra o stack LOCAL.
 *
 * Alvo explícito: `http://localhost:3002` (o `pdv-validacao-local` de `.claude/launch.json`).
 * O servidor deve estar rodando antes (`preview_start`/`npm run dev -- -p 3002`); este config
 * não sobe servidor e não usa a porta 3000 do `playwright.config.ts` padrão.
 *
 * Guard: recusa qualquer alvo que não seja localhost/127.0.0.1.
 *
 * Credenciais: vêm do ambiente (`PLAYWRIGHT_CAIXA_TEST_EMAIL` / `PLAYWRIGHT_CAIXA_TEST_PASSWORD`),
 * definidas pelo seed local (`npm run seed:dev-users`). Nenhum valor fica versionado aqui.
 *
 * Uso: `npx playwright test -c playwright.pdv100.config.ts`
 */

const PDV100_BASE_URL = process.env.PDV100_BASE_URL?.trim() || 'http://localhost:3002'

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(PDV100_BASE_URL)) {
  throw new Error(`RECUSADO: PDV-100 só roda contra localhost/127.0.0.1 (alvo: ${PDV100_BASE_URL}).`)
}

// Os helpers (`e2e/helpers/url.ts`) montam as URLs a partir de PLAYWRIGHT_BASE_URL /
// PLAYWRIGHT_TEST_PORT, e o padrão é a porta 3000. Sem alinhar essas variáveis, `gotoApp`
// ia para localhost:3000, onde responde outro serviço ("Upgrade Required", HTTP 426),
// e a `baseURL` deste config não era usada. Alinhamos aqui, antes dos workers subirem.
process.env.PLAYWRIGHT_BASE_URL = PDV100_BASE_URL
process.env.PLAYWRIGHT_TEST_PORT = new URL(PDV100_BASE_URL).port || '80'

export default defineConfig({
  testDir: './e2e',
  // Todos os specs; para a suíte de caixa passe os arquivos: `npx playwright test -c ... e2e/caixa*.spec.ts`.
  testMatch: /\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-pdv100' }]],
  outputDir: 'test-results-pdv100',
  use: {
    baseURL: PDV100_BASE_URL,
    headless: process.env.PDV100_HEADED === '1' ? false : true,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } }],
})
