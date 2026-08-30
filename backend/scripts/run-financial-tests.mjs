#!/usr/bin/env node
/**
 * Gate financeiro — executa as suítes que antes eram órfãs.
 *
 * Antes desta unidade, `financial-idempotency-correlation-contract.test.mjs`,
 * `sale-totals-invariant.test.sql`, `ar-receipts-reconciliation.test.sql` e
 * `ap-payments-reconciliation.test.sql` existiam no repositório mas nenhum npm
 * script e nenhum workflow os invocava: as Fases 1A–2B foram declaradas "PASS"
 * a partir de execuções manuais.
 *
 * Uso:
 *   npm run test:financial -w fastproduct-backend
 *
 * Conexão, na ordem de precedência:
 *   FINANCIAL_TEST_PSQL  comando completo do psql (ex.: 'psql postgres://...')
 *   DB_URL / POSTGRES_URL / DATABASE_URL  -> psql "<url>"
 *   fallback local: docker exec -i supabase_db_fastproduct psql -U postgres -d postgres
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

const NODE_SUITES = [
  'financial-idempotency-correlation-contract.test.mjs',
  'nfe-conferencia-margem-contract.test.mjs',
]

const SCRIPT_SUITES = ['test-commission-concurrency.mjs', 'test-nfe-conferencia-concurrency.mjs']

const SQL_SUITES = [
  'sale-totals-invariant.test.sql',
  'ar-receipts-reconciliation.test.sql',
  'ap-payments-reconciliation.test.sql',
  'financial-adversarial-gates.test.sql',
  'd0-pricing-tiers-ssot.test.sql',
  'd0-remessa-positive-and-inventory-zero.test.sql',
  'd0-remessa-conferencia-columns-drift.test.sql',
  'fase1-hardening-grants-residuais.test.sql',
  'fase3-tenant-isolation-transferencias-remessas.test.sql',
  'fase4-remessa-idempotencia-payload-hash.test.sql',
  'residual-grants-3-tabelas.test.sql',
  'nfe-conferencia-flx05-ui.test.sql',
  'fase6-consolida-padrao-a-dono-global.test.sql',
  'nfe-conferencia-margem-nao-bloqueia-estoque.test.sql',
]

/** `psql` está de fato instalado e executável neste host? */
function hasPsql() {
  const r = spawnSync('psql', ['--version'], { encoding: 'utf8' })
  return r.status === 0
}

function resolvePsqlCommand() {
  if (process.env.FINANCIAL_TEST_PSQL) {
    const parts = process.env.FINANCIAL_TEST_PSQL.split(' ').filter(Boolean)
    return { bin: parts[0], baseArgs: parts.slice(1), label: process.env.FINANCIAL_TEST_PSQL }
  }
  const url = process.env.DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL
  // A URL só é utilizável se houver cliente `psql`. Em dev no Windows as
  // variáveis costumam estar exportadas (`supabase status -o env`) sem que o
  // binário exista — antes disso o runner falhava com "exit null" em vez de
  // cair no contêiner.
  if (url && hasPsql()) return { bin: 'psql', baseArgs: [url], label: 'psql <url>' }
  if (url) {
    console.warn('psql não encontrado no PATH; usando o contêiner local do Supabase.')
  }
  return {
    bin: 'docker',
    baseArgs: ['exec', '-i', 'supabase_db_fastproduct', 'psql', '-U', 'postgres', '-d', 'postgres'],
    label: 'docker exec supabase_db_fastproduct psql (fallback local)',
  }
}

function runNodeSuite(file) {
  const path = join(HERE, file)
  if (!existsSync(path)) return { file, ok: false, detail: 'arquivo não encontrado' }
  const r = spawnSync(process.execPath, ['--test', path], { encoding: 'utf8' })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.status !== 0) process.stderr.write(out)
  const pass = /^# pass (\d+)/m.exec(out)?.[1]
  return { file, ok: r.status === 0, detail: pass ? `${pass} casos` : '' }
}

function runScriptSuite(file) {
  const path = join(HERE, file)
  if (!existsSync(path)) return { file, ok: false, detail: 'arquivo não encontrado' }
  const r = spawnSync(process.execPath, [path], { encoding: 'utf8' })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.status !== 0) process.stderr.write(out)
  const pass = [...out.matchAll(/^\s*PASS\s+/gm)].length
  return { file, ok: r.status === 0, detail: r.status === 0 ? `${pass} cenários` : `exit ${r.status}` }
}

function runSqlSuite(file, psql) {
  const path = join(HERE, file)
  if (!existsSync(path)) return { file, ok: false, detail: 'arquivo não encontrado' }
  // O SQL é passado por stdin para que o fallback via `docker exec` funcione sem
  // depender do arquivo existir dentro do contêiner.
  const r = spawnSync(psql.bin, [...psql.baseArgs, '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], {
    input: readFileSync(path, 'utf8'),
    encoding: 'utf8',
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.status !== 0) process.stderr.write(out)
  const err = /ERROR:\s*(.+)/.exec(out)?.[1]
  return { file, ok: r.status === 0, detail: r.status === 0 ? '' : (err ?? `exit ${r.status}`) }
}

function main() {
  const psql = resolvePsqlCommand()
  console.log(`Gate financeiro — conexão: ${psql.label}\n`)

  const results = []
  for (const f of NODE_SUITES) results.push(runNodeSuite(f))
  for (const f of SQL_SUITES) results.push(runSqlSuite(f, psql))
  for (const f of SCRIPT_SUITES) results.push(runScriptSuite(f))

  console.log('')
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.file}${r.detail ? `  — ${r.detail}` : ''}`)
  }

  const failed = results.filter((r) => !r.ok)
  console.log('')
  if (failed.length > 0) {
    console.error(`Gate financeiro FALHOU: ${failed.length}/${results.length} suíte(s).`)
    process.exit(1)
  }
  console.log(`Gate financeiro OK: ${results.length}/${results.length} suítes.`)
}

main()
