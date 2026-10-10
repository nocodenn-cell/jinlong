#!/usr/bin/env node
/**
 * CAP-02 — reconciliação pós-cenário (persistência, estoque, isolamento).
 * Somente DB local 127.0.0.1:54422.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const scenario = process.env.CAP02_SCENARIO || 'T00'
const since = process.env.CAP02_SINCE // ISO
const dbUrl =
  process.env.CAPACITY_DB_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54422/postgres'
const art = `/opt/cursor/artifacts/cap02-${scenario.toLowerCase()}-reconcile.json`

if (!/127\.0\.0\.1:54422|localhost:54422/.test(dbUrl)) {
  console.error('RECUSADO: DB não local')
  process.exit(2)
}
if (/supabase\.co/.test(dbUrl)) {
  console.error('RECUSADO: host remoto')
  process.exit(2)
}

function q(sql) {
  return execSync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -tAc ${JSON.stringify(sql)}`, {
    encoding: 'utf8',
  }).trim()
}

const sinceClause = since
  ? `AND v.data >= '${since}'::timestamptz`
  : `AND v.data >= now() - interval '2 hours'`

const vendas = Number(
  q(`SELECT count(*) FROM public.vendas v WHERE v.status='CONCLUIDA' ${sinceClause}`),
)
const porLoja = q(
  `SELECT coalesce(l.codigo,'?')||'='||count(*)::text
   FROM public.vendas v
   JOIN public.lojas l ON l.id=v.loja_id
   WHERE v.status='CONCLUIDA' ${sinceClause}
   GROUP BY 1 ORDER BY 1`,
)
  .split('\n')
  .filter(Boolean)

const duplicadas = Number(
  q(`SELECT count(*) FROM (
       SELECT id FROM public.vendas v
       WHERE v.status='CONCLUIDA' ${sinceClause}
       GROUP BY id HAVING count(*)>1
     ) d`),
)

const estoqueNegativo = Number(
  q(`SELECT count(*) FROM public.estoque WHERE quantidade_atual < 0`),
)

const caixasAbertos = Number(
  q(`SELECT count(*) FROM public.caixas WHERE status='ABERTO'`),
)

const locks = q(
  `SELECT count(*)::text FROM pg_locks WHERE NOT granted`,
)

const activity = q(
  `SELECT count(*)::text FROM pg_stat_activity WHERE datname='postgres' AND state='active'`,
)

const conexoes = q(
  `SELECT count(*)::text FROM pg_stat_activity WHERE datname='postgres'`,
)

// Isolamento: venda de loja A com caixa de loja B
const cruzadas = Number(
  q(`SELECT count(*)
     FROM public.vendas v
     JOIN public.caixas c ON c.id=v.caixa_id
     WHERE v.status='CONCLUIDA' ${sinceClause}
       AND v.loja_id IS DISTINCT FROM c.loja_id`),
)

const report = {
  scenario,
  since: since || 'now()-2h',
  vendas_persistidas: vendas,
  vendas_por_loja: porLoja,
  ids_duplicados: duplicadas,
  estoque_negativo: estoqueNegativo,
  caixas_abertos: caixasAbertos,
  locks_nao_granted: Number(locks),
  pg_active: Number(activity),
  pg_conexoes: Number(conexoes),
  vendas_caixa_loja_cruzada: cruzadas,
  ok:
    duplicadas === 0 &&
    estoqueNegativo === 0 &&
    cruzadas === 0,
}

fs.writeFileSync(art, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (!report.ok) process.exit(1)
