import { NextResponse, type NextRequest } from 'next/server'

import {
  fetchRawSession,
  normalizeAdminSession,
} from '@/lib/admin/auth/sessionConsistency'
import {
  createMiddlewareSupabase,
  isSupabaseConfigOk,
} from '@/lib/admin/auth/middlewareSupabase'
import { middlewareAdminDecision } from '@/lib/admin/policy/adminPolicy'

function applyRedirect(
  req: NextRequest,
  cookieSource: NextResponse,
  target: string
): NextResponse {
  const redir = NextResponse.redirect(new URL(target, req.url))
  cookieSource.cookies.getAll().forEach((cookie) => {
    redir.cookies.set(cookie)
  })
  return redir
}

/**
 * Thin adapter: raw session → normalizeAdminSession → adminPolicy → redirect.
 * Sem lógica de role, rota ou permissão inline.
 */
export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  const configOk = isSupabaseConfigOk()

  if (!configOk) {
    const decision = middlewareAdminDecision(
      normalizeAdminSession({ status: 'anonymous' }, 'edge'),
      pathname,
      { configOk: false }
    )
    if (decision.type === 'redirect' && decision.target) {
      return NextResponse.redirect(new URL(decision.target, req.url))
    }
    return NextResponse.next()
  }

  const { supabase, response } = createMiddlewareSupabase(req)
  const raw = await fetchRawSession(supabase)

  let normalized = normalizeAdminSession({ status: 'anonymous' }, 'edge')
  try {
    normalized = normalizeAdminSession(raw, 'edge')
  } catch {
    // policy avalia com normalização mínima
  }

  const decision = middlewareAdminDecision(normalized, pathname, { configOk: true })

  if (decision.type === 'redirect' && decision.target) {
    return applyRedirect(req, response, decision.target)
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*', '/gerente/:path*', '/caixa/:path*'],
}
