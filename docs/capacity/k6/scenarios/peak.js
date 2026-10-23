/**
 * Pico parametrizado — esqueleto FASE 2.
 *
 * Env:
 *   K6_LOJAS=1|5|10|25|50
 *   K6_CAIXAS_POR_LOJA=2
 *   K6_VENDAS_POR_HORA_POR_CAIXA=30  → sleep ≈ 3600/rate segundos entre finalizes
 *
 * FASE 3: implementar login por VU + POST RPC finalizar_venda_…_v4
 *          com idempotencyKey UUID único por iteração.
 */
import { sleep } from 'k6'
import { Counter } from 'k6/metrics'
import { assertSafeCapacityTarget } from '../lib/env-guard.js'

const lojas = Number(__ENV.K6_LOJAS || 1)
const caixasPorLoja = Number(__ENV.K6_CAIXAS_POR_LOJA || 2)
const vendasHora = Number(__ENV.K6_VENDAS_POR_HORA_POR_CAIXA || 30)
const vus = lojas * caixasPorLoja
const sleepEntreVendas = 3600 / vendasHora

const vendasPlanejadas = new Counter('vendas_planejadas')

export const options = {
  scenarios: {
    peak: {
      executor: 'constant-vus',
      vus,
      duration: __ENV.K6_DURATION || '5m',
    },
  },
  thresholds: {
    // Ativar quando finalize real existir (FASE 3):
    // 'http_req_duration{op:finalize}': ['p(95)<2000', 'p(99)<5000'],
    // http_req_failed: ['rate<0.001'],
  },
}

export function setup() {
  assertSafeCapacityTarget()
  if (vus < 1 || vus > 200) {
    throw new Error(`VU calculado inválido: ${vus}`)
  }
  console.log(
    JSON.stringify({
      lojas,
      caixasPorLoja,
      vus,
      vendasHoraPorCaixa: vendasHora,
      sleepEntreVendasSec: sleepEntreVendas,
      nota: 'Finalize real ainda não implementado — só calibra pacing',
    }),
  )
  return { sleepEntreVendas }
}

export default function (data) {
  // FASE 3: bipagens + finalizarVenda com UUID
  vendasPlanejadas.add(1)
  sleep(data.sleepEntreVendas)
}
