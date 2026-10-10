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
  const oneLine = String(sql).replace(/\s+/g, ' ').trim()
  return execSync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -tAc ${JSON.stringify(oneLine)}`, {
    encoding: 'utf8',
  }).trim()
}

const sinceSql = since
  ? `v.data >= '${since}'::timestamptz`
  : `v.data >= now() - interval '2 hours'`

const vendas = Number(
  q(`SELECT count(*) FROM public.vendas v WHERE v.status='CONCLUIDA' AND ${sinceSql}`),
)

const porLoja = q(
  `SELECT coalesce(l.codigo,'?')||'='||count(*)::text FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id JOIN public.lojas l ON l.id=c.loja_id WHERE v.status='CONCLUIDA' AND ${sinceSql} GROUP BY l.codigo ORDER BY l.codigo`,
)
  .split('\n')
  .filter(Boolean)

const duplicadas = Number(
  q(
    `SELECT count(*) FROM (SELECT id FROM public.vendas v WHERE v.status='CONCLUIDA' AND ${sinceSql} GROUP BY id HAVING count(*)>1) d`,
  ),
)

const estoqueNegativo = Number(
  q(`SELECT count(*) FROM public.estoque WHERE quantidade_atual < 0`),
)

const caixasAbertos = Number(
  q(`SELECT count(*) FROM public.caixas WHERE status='ABERTO'`),
)

const locks = Number(q(`SELECT count(*) FROM pg_locks WHERE NOT granted`))
const activity = Number(
  q(`SELECT count(*) FROM pg_stat_activity WHERE datname='postgres' AND state='active'`),
)
const conexoes = Number(
  q(`SELECT count(*) FROM pg_stat_activity WHERE datname='postgres'`),
)

// Isolamento: operador da venda deve pertencer à loja do caixa
const cruzadas = Number(
  q(
    `SELECT count(*) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id JOIN public.usuarios u ON u.id=v.operador_id WHERE v.status='CONCLUIDA' AND ${sinceSql} AND u.loja_id IS DISTINCT FROM c.loja_id`,
  ),
)

const saldoCaixas = q(
  `SELECT coalesce(sum(c.saldo_atual),0)::text FROM public.caixas c WHERE c.status='ABERTO'`,
)

const report = {
  scenario,
  since: since || 'now()-2h',
  vendas_persistidas: vendas,
  vendas_por_loja: porLoja,
  ids_duplicados: duplicadas,
  estoque_negativo: estoqueNegativo,
  caixas_abertos: caixasAbertos,
  saldo_caixas_abertos: Number(saldoCaixas),
  locks_nao_granted: locks,
  pg_active: activity,
  pg_conexoes: conexoes,
  vendas_operador_loja_cruzada: cruzadas,
  ok: duplicadas === 0 && estoqueNegativo === 0 && cruzadas === 0 && vendas > 0,
}

fs.writeFileSync(art, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (!report.ok) process.exit(1)
