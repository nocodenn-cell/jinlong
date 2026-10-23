/**
 * Smoke de capacidade — valida guard + reachability.
 * NÃO finaliza venda real até FASE 3 (auth + payload canônico).
 *
 *   CAPACITY_ENV=staging K6_SUPABASE_URL=... k6 run scenarios/smoke.js
 */
import http from 'k6/http'
import { check, sleep } from 'k6'
import { assertSafeCapacityTarget } from '../lib/env-guard.js'

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
}

export function setup() {
  assertSafeCapacityTarget()
  return {
    url: __ENV.K6_SUPABASE_URL.replace(/\/$/, ''),
    anon: __ENV.K6_ANON_KEY || '',
  }
}

export default function (data) {
  const res = http.get(`${data.url}/rest/v1/`, {
    headers: {
      apikey: data.anon,
      Authorization: `Bearer ${data.anon}`,
    },
    tags: { op: 'rest_root' },
  })

  check(res, {
    'rest alcançável (não 5xx)': (r) => r.status < 500,
  })

  sleep(1)
}
