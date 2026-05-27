import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware de sessão e proteção de rotas.
 *
 * Responsabilidades:
 * 1. Refresh do token de sessão Supabase a cada request (evita logout silencioso)
 * 2. Redirecionar para /login se rota protegida e sem sessão válida
 * 3. Redirecionar para /caixa ou /gerente se já autenticado e bate em /login
 *
 * Não faz verificação de perfil (OPERADOR/GERENTE/DONO) — isso é responsabilidade
 * das páginas e server actions, que já chamam supabase.auth.getUser().
 */

// Rotas que exigem sessão válida
const PROTECTED_PREFIXES = ['/caixa', '/gerente', '/admin']

// Rotas públicas que autenticados devem sair
const AUTH_ONLY_PATHS = ['/login']

// Rotas que o middleware não deve tocar
const BYPASS_PREFIXES = [
  '/_next',
  '/api',          // API routes fazem auth própria
  '/favicon',
  '/manifest',
  '/icons',
  '/robots',
  '/sitemap',
]

function shouldBypass(pathname: string): boolean {
  return BYPASS_PREFIXES.some((p) => pathname.startsWith(p))
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
}

function isAuthOnly(pathname: string): boolean {
  return AUTH_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (shouldBypass(pathname)) return NextResponse.next()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Se vars de ambiente ausentes, deixa passar — app vai mostrar erro útil
  if (!supabaseUrl || !supabaseKey) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        // Propaga cookies atualizados para o response (refresh de token)
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  // IMPORTANTE: usar getUser() e não getSession() — getSession() não valida o JWT no servidor
  const { data: { user } } = await supabase.auth.getUser()

  if (isProtected(pathname) && !user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  if (isAuthOnly(pathname) && user) {
    // Redireciona para o destino pré-login ou para /caixa por padrão
    const next = request.nextUrl.searchParams.get('next')
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = next && isProtected(next) ? next : '/caixa'
    redirectUrl.searchParams.delete('next')
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Roda em todas as rotas exceto arquivos estáticos e internos do Next
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
