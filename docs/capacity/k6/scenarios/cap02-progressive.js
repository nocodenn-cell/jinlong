/**
 * CAP-02 — carga progressiva local (venda autenticada v4 real).
 *
 * Env obrigatório (só local):
 *   CAPACITY_ENV=local
 *   K6_SUPABASE_URL=http://127.0.0.1:54421
 *   K6_ANON_KEY=...
 *   CAPACITY_K6_PASSWORD=...
 *   K6_FIXTURES=/path/to/k6-fixtures.json
 *   CAP02_SCENARIO=T00|T01|T02|T03|T04|T05
 */
import { check, sleep } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'
import { SharedArray } from 'k6/data'
import { assertSafeCapacityTarget } from '../lib/env-guard.js'
import { loginOperador } from '../lib/auth.js'
import { finalizarVendaV4 } from '../lib/sale.js'

const scenario = (__ENV.CAP02_SCENARIO || 'T00').toUpperCase()

const SCENARIOS = {
  T00: { vus: 1, duration: '5m', vendasHoraPorCaixa: 60, lojas: 1, label: '1 caixa · 1 venda/min · 5m' },
  T01: { vus: 1, duration: '15m', vendasHoraPorCaixa: 60, lojas: 1, label: '1 caixa · 60/h · 15m' },
  T02: { vus: 2, duration: '15m', vendasHoraPorCaixa: 60, lojas: 1, label: '2 caixas · 120/h total · 15m' },
  T03: { vus: 2, duration: '15m', vendasHoraPorCaixa: 120, lojas: 1, label: '2 caixas · 240/h total · 15m' },
  T04: { vus: 10, duration: '15m', vendasHoraPorCaixa: 60, lojas: 5, label: '5×2 caixas · 600/h total · 15m' },
  T05: { vus: 20, duration: '15m', vendasHoraPorCaixa: 60, lojas: 10, label: '10×2 caixas · 1200/h total · 15m' },
}

const cfg = SCENARIOS[scenario]
if (!cfg) {
  throw new Error(`CAP02_SCENARIO inválido: ${scenario}`)
}

const sleepSec = 3600 / cfg.vendasHoraPorCaixa
const taxaTotalHora = cfg.vus * cfg.vendasHoraPorCaixa

const vendasTentadas = new Counter('vendas_tentadas')
const vendasConfirmadas = new Counter('vendas_confirmadas')
const finalizeFail = new Rate('finalize_fail_rate')
const finalizeDuration = new Trend('finalize_duration', true)

const fixtures = new SharedArray('cashiers', () => {
  const path = __ENV.K6_FIXTURES
  if (!path) throw new Error('K6_FIXTURES ausente')
  const data = JSON.parse(open(path))
  if (data.api_url !== 'http://127.0.0.1:54421') {
    throw new Error(`fixture api_url não local: ${data.api_url}`)
  }
  if (data.project !== 'fastproduct-capacity') {
    throw new Error(`fixture project inválido: ${data.project}`)
  }
  return data.cashiers
})

export const options = {
  scenarios: {
    cap02: {
      executor: 'constant-vus',
      vus: cfg.vus,
      duration: cfg.duration,
      gracefulStop: '30s',
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max', 'count'],
  thresholds: {
    http_req_failed: ['rate<0.02'],
    'http_req_duration{op:finalize_v4}': ['p(95)<3000', 'p(99)<8000'],
    finalize_fail_rate: ['rate<0.02'],
    checks: ['rate>0.95'],
  },
}

export function setup() {
  assertSafeCapacityTarget()
  const url = (__ENV.K6_SUPABASE_URL || '').replace(/\/$/, '')
  if (url !== 'http://127.0.0.1:54421') {
    throw new Error(`K6_SUPABASE_URL deve ser http://127.0.0.1:54421 (got ${url})`)
  }
  if (/supabase\.co/i.test(url)) {
    throw new Error('URL supabase.co proibida')
  }
  const anon = __ENV.K6_ANON_KEY
  const password = __ENV.CAPACITY_K6_PASSWORD
  if (!anon || !password) throw new Error('K6_ANON_KEY / CAPACITY_K6_PASSWORD ausentes')

  if (fixtures.length < cfg.vus) {
    throw new Error(`fixtures insuficientes: ${fixtures.length} < vus ${cfg.vus}`)
  }

  const needed = fixtures.slice(0, cfg.vus)
  const sessions = []
  for (const c of needed) {
    const login = loginOperador(url, anon, c.email, password)
    if (!login.ok) {
      throw new Error(`login falhou ${c.email}: ${login.status} ${login.body}`)
    }
    if (login.user_id && login.user_id !== c.operador_id) {
      throw new Error(`user_id mismatch ${c.email}`)
    }
    sessions.push({
      ...c,
      access_token: login.access_token,
    })
  }

  console.log(
    JSON.stringify({
      scenario,
      label: cfg.label,
      vus: cfg.vus,
      duration: cfg.duration,
      vendasHoraPorCaixa: cfg.vendasHoraPorCaixa,
      taxaTotalHora,
      sleepSec,
      api: url,
      project: 'fastproduct-capacity',
    }),
  )

  return {
    api: url,
    anon,
    sessions,
    sleepSec,
    started_at: new Date().toISOString(),
  }
}

export default function (data) {
  const idx = (__VU - 1) % data.sessions.length
  const session = data.sessions[idx]
  vendasTentadas.add(1)
  const result = finalizarVendaV4(data.api, data.anon, session.access_token, session)
  finalizeFail.add(!result.ok)
  finalizeDuration.add(result.duration_ms)
  if (result.ok) {
    vendasConfirmadas.add(1)
  } else {
    console.error(
      JSON.stringify({
        vu: __VU,
        email: session.email,
        http: result.http_status,
        rpc: result.rpc_status,
        body: result.body_excerpt,
      }),
    )
  }
  check(result, { 'venda ok': (r) => r.ok })
  sleep(data.sleepSec)
}

export function handleSummary(data) {
  const path = __ENV.CAP02_SUMMARY_PATH || `/tmp/cap02-${scenario}-summary.json`
  return {
    [path]: JSON.stringify(
      {
        scenario,
        label: cfg.label,
        taxaTotalHora,
        metrics: data.metrics,
        root_group: data.root_group,
      },
      null,
      2,
    ),
    stdout: textSummary(data, scenario, cfg, taxaTotalHora),
  }
}

function textSummary(data, scenario, cfg, taxaTotalHora) {
  const m = data.metrics || {}
  const get = (name, field) => (m[name] && m[name].values && m[name].values[field]) || null
  return [
    `=== CAP-02 ${scenario} ===`,
    cfg.label,
    `taxa_planejada_total_hora=${taxaTotalHora}`,
    `vendas_tentadas=${get('vendas_tentadas', 'count')}`,
    `vendas_confirmadas=${get('vendas_confirmadas', 'count')}`,
    `finalize_fail_rate=${get('finalize_fail_rate', 'rate')}`,
    `finalize_p95=${get('finalize_duration', 'p(95)')}`,
    `finalize_p99=${get('finalize_duration', 'p(99)')}`,
    `http_req_failed=${get('http_req_failed', 'rate')}`,
    '',
  ].join('\n')
}
