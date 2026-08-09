#!/usr/bin/env node
/**
 * Fase 3.2 gate: migration 24704 present + guards + optional isolated smoke.
 *
 * Uso:
 *   node backend/supabase/scripts/validate-phase3-2.mjs
 *   RUN_PHASE32_SMOKE=1 DATABASE_URL=... node backend/supabase/scripts/validate-phase3-2.mjs
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const REPO_ROOT = join(ROOT, '../..')
const MIG = join(ROOT, 'migrations', '20260808130200_24704_reapply_venda_finance_context_idempotent.sql')

function run(cmd, cwd = REPO_ROOT) {
  execSync(cmd, { cwd, stdio: 'inherit' })
}

if (!existsSync(MIG)) {
  console.error('Missing migration:', MIG)
  process.exit(1)
}

const body = readFileSync(MIG, 'utf8')
if (!body.includes('Fase 3.2') || !body.includes('sincronizar_finance_context_venda')) {
  console.error('Migration body sanity check failed')
  process.exit(1)
}

run('npm run guard:migrations')
run(`node ${join(ROOT, 'scripts', 'validate-phase1-backport.mjs')}`)

if (process.env.RUN_PHASE32_SMOKE === '1' && process.env.DATABASE_URL) {
  run(`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ${join(ROOT, 'scripts', 'phase3-2-smoke-stubs.sql')}`, REPO_ROOT)
  run(`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ${MIG}`, REPO_ROOT)
  run(`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ${MIG}`, REPO_ROOT)
  run(
    `psql "$DATABASE_URL" -t -A -f ${join(ROOT, 'scripts', 'verify-venda-finance-context-catalog.sql')} | node ${join(ROOT, 'scripts', 'verify-venda-finance-context-catalog.mjs')} --stdin`,
    REPO_ROOT,
  )
}

console.log('Phase 3.2 validation OK')
