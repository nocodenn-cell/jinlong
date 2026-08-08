#!/usr/bin/env node
/**
 * Verifica catálogo venda_finance_context vs expectativa migration 252 / 3.2.
 * Uso local/staging:
 *   psql "$DATABASE_URL" -f - <<'SQL' | node verify-venda-finance-context-catalog.mjs --stdin
 *   ... query ...
 *   SQL
 * Ou após db reset:
 *   npx supabase db execute --local -f backend/supabase/scripts/verify-venda-finance-context-catalog.sql
 *
 * Exit 0 se todos os checks passarem.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'reports', 'phase3-2-catalog-verify.json')

/** @type {Record<string, boolean>} */
const EXPECTED = {
  table_venda_finance_context: true,
  fn_sincronizar: true,
  fn_trg_pagamento: true,
  fn_trg_conta: true,
  trg_pagamento: true,
  trg_conta: true,
  policy_select: true,
  idx_loja: true,
  idx_status: true,
  idx_conta: true,
}

const VERIFY_SQL = `
SELECT json_build_object(
  'table_venda_finance_context', to_regclass('public.venda_finance_context') IS NOT NULL,
  'fn_sincronizar', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sincronizar_finance_context_venda'
  ),
  'fn_trg_pagamento', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'trg_finance_context_via_pagamento'
  ),
  'fn_trg_conta', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'trg_finance_context_via_conta'
  ),
  'trg_pagamento', EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE NOT t.tgisinternal AND t.tgname = 'trg_finance_context_pagamento'
  ),
  'trg_conta', EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE NOT t.tgisinternal AND t.tgname = 'trg_finance_context_conta'
  ),
  'policy_select', EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'venda_finance_context'
      AND policyname = 'venda_finance_context_select_loja'
  ),
  'idx_loja', EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_venda_finance_context_loja'
  ),
  'idx_status', EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_venda_finance_context_status'
  ),
  'idx_conta', EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_venda_finance_context_conta'
  )
) AS catalog;
`.trim()

export { EXPECTED, VERIFY_SQL, OUT }

function parseCatalogInput(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed.catalog) return parsed.catalog
    return parsed
  } catch {
    const line = trimmed.split('\n').find((l) => l.startsWith('{'))
    if (!line) return null
    return JSON.parse(line).catalog ?? JSON.parse(line)
  }
}

function evaluate(catalog) {
  /** @type {Record<string, { expected: boolean, actual: boolean, ok: boolean }>} */
  const checks = {}
  let allOk = true
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const actual = Boolean(catalog[key])
    const ok = actual === expected
    if (!ok) allOk = false
    checks[key] = { expected, actual, ok }
  }
  return { allOk, checks }
}

function main() {
  const stdinFlag = process.argv.includes('--stdin')
  let catalog = null
  if (stdinFlag) {
    const raw = readFileSync(0, 'utf8')
    catalog = parseCatalogInput(raw)
  } else if (process.argv.includes('--file')) {
    const i = process.argv.indexOf('--file')
    catalog = parseCatalogInput(readFileSync(process.argv[i + 1], 'utf8'))
  }
  if (!catalog) {
    writeFileSync(join(ROOT, 'scripts', 'verify-venda-finance-context-catalog.sql'), `${VERIFY_SQL};\n`)
    console.error('Wrote verify SQL snippet; run against DB and pipe JSON to --stdin')
    process.exit(2)
  }
  const { allOk, checks } = evaluate(catalog)
  const report = {
    generatedAt: new Date().toISOString(),
    phase: '3.2',
    migrationFile: '20260808130200_24704_reapply_venda_finance_context_idempotent.sql',
    source252: '252_venda_finance_context_mirror.sql',
    allOk,
    checks,
  }
  writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  process.exit(allOk ? 0 : 1)
}

main()
