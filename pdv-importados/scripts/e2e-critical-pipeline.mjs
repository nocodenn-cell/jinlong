#!/usr/bin/env node
/**
 * Pipeline E2E crítico: valida env do painel e do PDV local, smoke na Edge sync-outbox,
 * depois roda sync-fluxo-gerente, caixa-venda, caixa-venda-multi-pagamento (split) e caixa-fluxos-criticos.
 *
 * Uso (a partir de pdv-importados): npm run test:e2e:critical
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pdvImportados = join(__dirname, '..')
const pdvLocal = join(__dirname, '..', '..', 'pdv-local')

function runStep(title, command, args, cwd, options = {}) {
  console.log(`\n>>> ${title}\n`)
  const shell =
    options.shell ??
    (process.platform === 'win32' && command === 'npx')
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell,
  })
  const code = result.status ?? (result.signal ? 1 : 0)
  if (code !== 0) {
    console.error(`\n[pipeline] Falhou: ${title} (código ${code})\n`)
    process.exit(code)
  }
  console.log(`\n[pipeline] OK: ${title}\n`)
}

runStep('env:check (pdv-importados)', 'node', ['scripts/check-env.mjs'], pdvImportados)
runStep('env:check (pdv-local)', 'node', ['scripts/check-env.mjs'], pdvLocal)
runStep('smoke:sync-edge (pdv-local)', 'node', ['scripts/smoke-sync-edge.mjs'], pdvLocal)
runStep('playwright e2e/sync-fluxo-gerente.spec.ts', 'npx', [
  'playwright',
  'test',
  'e2e/sync-fluxo-gerente.spec.ts',
], pdvImportados)

runStep('playwright e2e/caixa-venda.spec.ts', 'npx', [
  'playwright',
  'test',
  'e2e/caixa-venda.spec.ts',
], pdvImportados)

runStep('playwright e2e/caixa-venda-multi-pagamento.spec.ts', 'npx', [
  'playwright',
  'test',
  'e2e/caixa-venda-multi-pagamento.spec.ts',
], pdvImportados)

runStep('playwright e2e/caixa-fluxos-criticos.spec.ts', 'npx', [
  'playwright',
  'test',
  'e2e/caixa-fluxos-criticos.spec.ts',
], pdvImportados)

console.log(
  '[pipeline] Concluído: env, smoke sync, E2E sync-gerente, vendas caixa (simples + split 2 e 3 parcelas) e fluxos caixa.',
)
