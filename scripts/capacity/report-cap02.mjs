#!/usr/bin/env node
/**
 * CAP-02 — tabela comparativa T00–T05 a partir dos artefatos de cada cenário
 * (latency.json, reconcile.json, summary.json). Saída: /opt/cursor/artifacts/cap02-comparativo.md
 */
import fs from 'node:fs'

const ART = '/opt/cursor/artifacts'
const SCEN = ['t00', 't01', 't02', 't03', 't04', 't05']
const TAXA = { t00: 60, t01: 60, t02: 120, t03: 240, t04: 600, t05: 1200 }

function load(s, kind) {
  const p = `${ART}/cap02-${s}-${kind}.json`
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null
}

function fmt(v, suf = '') {
  return v === null || v === undefined ? '—' : `${v}${suf}`
}

function errosTotal(lat) {
  return Object.values(lat?.erros_por_categoria || {}).reduce((a, b) => a + b, 0)
}

function row(s) {
  const lat = load(s, 'latency')
  const rec = load(s, 'reconcile')
  const sum = load(s, 'summary')?.metrics
  if (!lat) return `| ${s.toUpperCase()} | ${TAXA[s]} | não executado | | | | | | | | |`
  const tent = sum?.vendas_tentadas?.values?.count ?? null
  const r = lat.recursos
  return [
    s.toUpperCase(),
    TAXA[s],
    `${fmt(tent)}/${lat.vendas_confirmadas}/${fmt(rec?.vendas_persistidas)}`,
    fmt(lat.vendas_por_minuto?.media),
    `${errosTotal(lat)} (timeouts ${lat.timeouts ?? 0})`,
    `${fmt(lat.finalize_rpc_http_ms?.p95)} / ${fmt(lat.finalize_rpc_http_ms?.p99)}`,
    lat.venda_completa_ms ? `${lat.venda_completa_ms.p95} / ${lat.venda_completa_ms.p99}` : '—',
    r ? `${fmt(r.host_cpu_pct.media)} / ${fmt(r.host_cpu_pct.max)}` : '—',
    r ? fmt(r.mem_avail_mb_min) : '—',
    r ? `${r.pg_conns_max} / ${r.locks_wait_max}` : '—',
    rec ? (rec.ok ? 'OK (0 div.)' : 'DIVERGENTE') : '—',
  ].join(' | ').replace(/^/, '| ').concat(' |')
}

const header = [
  '| Cen. | Taxa plan./h | Tent./Conf./Persist. | Vendas/min | Erros | RPC p95/p99 ms | Venda completa p95/p99 ms | CPU host méd/máx % | RAM disp. mín MB | PG conns/locks máx | Reconciliação |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
]
const md = [...header, ...SCEN.map(row)].join('\n')
fs.writeFileSync(`${ART}/cap02-comparativo.md`, `${md}\n`)
console.log(md)
