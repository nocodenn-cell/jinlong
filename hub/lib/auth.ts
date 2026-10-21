import 'server-only'
import type { HubConfig } from './config'

export interface Tokens {
  access_token: string
  refresh_token: string
  expires_at: number
}

async function tokenRequest(cfg: HubConfig, grant: 'password' | 'refresh_token', body: object, fetchImpl: typeof fetch): Promise<Tokens | null> {
  const res = await fetchImpl(`${cfg.url}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
  if (!j.access_token || !j.refresh_token) return null
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600) }
}

export const signIn = (cfg: HubConfig, email: string, password: string, fetchImpl: typeof fetch = fetch) =>
  tokenRequest(cfg, 'password', { email, password }, fetchImpl)

export const refresh = (cfg: HubConfig, refreshToken: string, fetchImpl: typeof fetch = fetch) =>
  tokenRequest(cfg, 'refresh_token', { refresh_token: refreshToken }, fetchImpl)

/** Papel admin verificado no servidor, pela própria função do banco (RLS usa a mesma). */
export async function isAdmin(cfg: HubConfig, accessToken: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const res = await fetchImpl(`${cfg.url}/rest/v1/rpc/is_commercial_admin`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: '{}',
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  return res.ok && (await res.json()) === true
}

/** exp do JWT (sem validar assinatura — quem valida é o Supabase em cada chamada). */
export function jwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}
