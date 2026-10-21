import { NextResponse, type NextRequest } from 'next/server'

const AT = 'nc_hub_at'
const RT = 'nc_hub_rt'

function exp(token: string): number {
  try {
    const b64 = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')
    return (JSON.parse(atob(b64)) as { exp?: number }).exp ?? 0
  } catch {
    return 0
  }
}

/** Renova a sessão (refresh token) quando o access token está perto de expirar. Sem sessão → /login. */
export async function middleware(req: NextRequest) {
  if (process.env.HUB_DEMO_DATA === 'ficticio' && process.env.VERCEL_ENV !== 'production' && !process.env.HUB_SUPABASE_URL) return NextResponse.next()
  const at = req.cookies.get(AT)?.value
  const rt = req.cookies.get(RT)?.value
  if (at && exp(at) - 60 > Date.now() / 1000) return NextResponse.next()
  const url = process.env.HUB_SUPABASE_URL?.trim().replace(/\/$/, '')
  const key = process.env.HUB_SUPABASE_ANON_KEY?.trim()
  if (rt && url && key) {
    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    }).catch(() => null)
    const j = res?.ok ? ((await res.json()) as { access_token?: string; refresh_token?: string }) : null
    if (j?.access_token && j.refresh_token) {
      req.cookies.set(AT, j.access_token)
      const next = NextResponse.next({ request: { headers: req.headers } })
      const opts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' }
      next.cookies.set(AT, j.access_token, { ...opts, maxAge: 3600 })
      next.cookies.set(RT, j.refresh_token, { ...opts, maxAge: 60 * 60 * 24 * 7 })
      return next
    }
  }
  const login = new URL('/login', req.url)
  const out = NextResponse.redirect(login)
  out.cookies.delete(AT)
  out.cookies.delete(RT)
  return out
}

export const config = { matcher: ['/((?!login|_next|favicon.ico).*)'] }
