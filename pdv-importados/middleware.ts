import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isPerfilPainelGerencial, PREFIXOS_ROTAS_PAINEL_WEB } from '@/lib/auth/painelGerencial'
import { isStaleAuthMessage } from '@/lib/auth/staleSession'
import { normalizePerfilUsuario } from '@/idioma/normalizePerfilUsuario'

function supabaseConfigOk(url: string | undefined, anonKey: string | undefined): boolean {
  if (!url?.trim() || !anonKey?.trim()) return false
  try {
    const u = new URL(url.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Protege rotas autenticadas e mantém sessão Supabase (cookies) no edge.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPainelWeb =
    pathname.startsWith(PREFIXOS_ROTAS_PAINEL_WEB[0]) ||
    pathname.startsWith(PREFIXOS_ROTAS_PAINEL_WEB[1])
  const isCaixaWeb = pathname === '/caixa' || pathname.startsWith('/caixa/')
  const isProtected = isPainelWeb || isCaixaWeb

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const redirectLogin = () => {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  const redirectWithSession = (target: URL, cookieSource: NextResponse) => {
    const redir = NextResponse.redirect(target)
    cookieSource.cookies.getAll().forEach((cookie) => {
      redir.cookies.set(cookie)
    })
    return redir
  }

  if (!supabaseConfigOk(supabaseUrl, supabaseKey)) {
    if (isProtected) {
      return redirectLogin()
    }
    return NextResponse.next()
  }

  const publicSupabaseUrl = (supabaseUrl ?? '').trim()
  const publicSupabaseKey = (supabaseKey ?? '').trim()

  const response = NextResponse.next({ request })
  const supabase = createServerClient(publicSupabaseUrl, publicSupabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
      ) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError && isStaleAuthMessage(authError.message)) {
    try {
      await supabase.auth.signOut()
    } catch {
      /* noop */
    }
    return redirectLogin()
  }

  if (isProtected && !user) {
    return redirectLogin()
  }

  if (isProtected && user) {
    const { data: row } = await supabase
      .from('usuarios')
      .select('perfil')
      .eq('id', user.id)
      .maybeSingle()

    const perfil = normalizePerfilUsuario(typeof row?.perfil === 'string' ? row.perfil : null)
    const gerenteOuDono = isPerfilPainelGerencial(perfil)
    const caixaRoute = isCaixaWeb

    if (isPainelWeb && !gerenteOuDono) {
      const url = request.nextUrl.clone()
      url.pathname = '/caixa'
      url.search = ''
      return redirectWithSession(url, response)
    }
    if (caixaRoute && gerenteOuDono) {
      const url = request.nextUrl.clone()
      url.pathname = '/gerente'
      url.search = ''
      return redirectWithSession(url, response)
    }
  }

  return response
}

export const config = {
  matcher: ['/gerente/:path*', '/admin/:path*', '/caixa', '/caixa/:path*'],
}
