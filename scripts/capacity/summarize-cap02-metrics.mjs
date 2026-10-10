#!/usr/bin/env node
/**
 * CAP-02 — resume o NDJSON de `k6 --out json` de um cenário:
 * percentis do finalize_v4, erros por categoria, vendas/min e degradação (1º vs último terço).
 * Uso: node summarize-cap02-metrics.mjs T02
 */
import fs from 'node:fs'
import readline from 'node:readline'

const ART = '/opt/cursor/artifacts'
const scenario = String(process.argv[2] || '').toLowerCase()
if (!/^t0[0-5]$/.test(scenario)) {
  console.error('uso: summarize-cap02-metrics.mjs T0N')
  process.exit(2)
}
const metricsPath = `${ART}/cap02-${scenario}-metrics.json`

function pct(sorted, p) {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return Number(sorted[Math.max(0, idx)].toFixed(2))
}

function stats(values) {
  const s = [...values].sort((a, b) => a - b)
  return { n: s.length, p50: pct(s, 50), p95: pct(s, 95), p99: pct(s, 99), max: pct(s, 100) }
}

function errorCategory(tags) {
  const status = Number(tags.status || 0)
  if (status === 0) return tags.error_code === '1050' ? 'timeout' : 'network'
  if (status >= 500) return 'http_5xx'
  if (status === 401 || status === 403) return 'auth'
  if (status >= 400) return 'http_4xx'
  return null
}

async function readPoints() {
  const points = { finalize: [], completa: [], confirmed: [], errors: {}, reqs: {} }
  const rl = readline.createInterface({ input: fs.createReadStream(metricsPath) })
  for await (const line of rl) {
    if (!line.includes('"type":"Point"')) continue
    const { metric, data } = JSON.parse(line)
    const t = Date.parse(data.time)
    if (metric === 'http_req_duration' && data.tags.group !== '::setup') {
      const op = data.tags.op || 'outro'
      points.reqs[op] = (points.reqs[op] || 0) + 1
      if (op === 'finalize_v4') points.finalize.push({ t, v: data.value })
      const cat = errorCategory(data.tags)
      if (cat) points.errors[`${op}:${cat}`] = (points.errors[`${op}:${cat}`] || 0) + 1
    }
    if (metric === 'venda_completa_duration') points.completa.push(data.value)
    if (metric === 'vendas_confirmadas') points.confirmed.push(t)
  }
  return points
}

function perMinute(times) {
  if (!times.length) return { media: 0, min: 0, max: 0 }
  const t0 = Math.min(...times)
  const buckets = new Map()
  for (const t of times) {
    const m = Math.floor((t - t0) / 60000)
    buckets.set(m, (buckets.get(m) || 0) + 1)
  }
  const minutes = Math.max(1, Math.ceil((Math.max(...times) - t0) / 60000))
  const counts = Array.from({ length: minutes }, (_, m) => buckets.get(m) || 0)
  return {
    media: Number((times.length / minutes).toFixed(2)),
    min: Math.min(...counts),
    max: Math.max(...counts),
  }
}

function degradation(finalize) {
  if (finalize.length < 6) return null
  const sorted = [...finalize].sort((a, b) => a.t - b.t)
  const third = Math.floor(sorted.length / 3)
  const first = stats(sorted.slice(0, third).map((p) => p.v))
  const last = stats(sorted.slice(-third).map((p) => p.v))
  const ratio = first.p95 ? Number((last.p95 / first.p95).toFixed(2)) : null
  return { primeiro_terco_p95: first.p95, ultimo_terco_p95: last.p95, razao_p95: ratio }
}

function num(v) {
  const n = Number.parseFloat(String(v ?? '').replace('%', ''))
  return Number.isFinite(n) ? n : null
}

function resourcePeaks() {
  const path = `${ART}/cap02-${scenario}-samples.tsv`
  if (!fs.existsSync(path)) return null
  const [header, ...lines] = fs.readFileSync(path, 'utf8').trim().split('\n')
  const cols = header.split('\t')
  const rowsTsv = lines.map((l) => Object.fromEntries(l.split('\t').map((v, i) => [cols[i], num(v)])))
  if (!rowsTsv.length) return { amostras: 0 }
  const series = (c) => rowsTsv.map((r) => r[c]).filter((v) => v !== null)
  const max = (c) => Math.max(...series(c))
  const avg = (c) => Number((series(c).reduce((a, b) => a + b, 0) / series(c).length).toFixed(1))
  const delta = (c) => (series(c).length ? series(c).at(-1) - series(c)[0] : null)
  return {
    amostras: rowsTsv.length,
    host_cpu_pct: { media: avg('host_cpu_pct'), max: max('host_cpu_pct') },
    mem_avail_mb_min: Math.min(...series('mem_avail_mb')),
    pg_conns_max: max('pg_conns'),
    pg_active_max: max('pg_active'),
    locks_wait_max: max('locks_wait'),
    pg_rollbacks_delta: delta('pg_rollbacks'),
    pg_deadlocks_delta: delta('pg_deadlocks'),
    db_cpu_pct_max: max('db_cpu'),
    rest_cpu_pct_max: max('rest_cpu'),
    kong_cpu_pct_max: max('kong_cpu'),
    auth_cpu_pct_max: max('auth_cpu'),
  }
}

const points = await readPoints()
const out = {
  scenario: scenario.toUpperCase(),
  finalize_rpc_http_ms: stats(points.finalize.map((p) => p.v)),
  venda_completa_ms: points.completa.length ? stats(points.completa) : null,
  requisicoes_por_etapa: points.reqs,
  erros_por_categoria: points.errors,
  timeouts: Object.entries(points.errors)
    .filter(([k]) => k.endsWith(':timeout'))
    .reduce((s, [, n]) => s + n, 0),
  vendas_confirmadas: points.confirmed.length,
  vendas_por_minuto: perMinute(points.confirmed),
  degradacao: degradation(points.finalize),
  recursos: resourcePeaks(),
}
fs.writeFileSync(`${ART}/cap02-${scenario}-latency.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
