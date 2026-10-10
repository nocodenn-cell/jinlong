import http from 'k6/http'
import { check } from 'k6'

/**
 * Login password grant — um token por caixa/VU (sem compartilhar entre VUs).
 */
export function loginOperador(apiUrl, anonKey, email, password) {
  const res = http.post(
    `${apiUrl}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email, password }),
    {
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      tags: { op: 'auth_login' },
    },
  )
  const ok = check(res, {
    'login 200': (r) => r.status === 200,
  })
  if (!ok) {
    return { ok: false, status: res.status, body: String(res.body).slice(0, 200) }
  }
  const body = res.json()
  return {
    ok: true,
    access_token: body.access_token,
    user_id: body.user && body.user.id,
  }
}
