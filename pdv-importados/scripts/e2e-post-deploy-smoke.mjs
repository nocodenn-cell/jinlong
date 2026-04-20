#!/usr/bin/env node
/**
 * Smoke Playwright contra URL já implantada (sem `next dev`, sem pdv-local, sem sync Edge).
 * Usado pelo job `smoke-test` em `.github/workflows/ci-pdv-importados.yml` após deploy Vercel.
 *
 * Exige: PLAYWRIGHT_BASE_URL, CI=true, NEXT_PUBLIC_SUPABASE_*, PLAYWRIGHT_CAIXA_TEST_*.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pdvImportados = join(__dirname, '..')

const base = process.env.PLAYWRIGHT_BASE_URL?.trim()
if (!base) {
  console.error('[post-deploy-smoke] Falta PLAYWRIGHT_BASE_URL (URL do deploy Vercel).')
  process.exit(1)
}

if (process.env.CI !== 'true') {
  console.warn('[post-deploy-smoke] Aviso: esperado CI=true para alinhar ao playwright.config (sem webServer).')
}

const specs = ['e2e/login.spec.ts', 'e2e/caixa.spec.ts']
console.log(`[post-deploy-smoke] Base: ${base}`)
console.log(`[post-deploy-smoke] Specs: ${specs.join(' ')}`)

const result = spawnSync('npx', ['playwright', 'test', ...specs], {
  cwd: pdvImportados,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
