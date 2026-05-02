import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { isPerfilPainelGerencial, PREFIXOS_ROTAS_PAINEL_WEB } from '@/lib/auth/painelGerencial'

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
 * Protege rotas do PDV autenticadas e mantém a sessão Supabase atualizada (cookies).
 * Sem config válida: rotas protegidas redirecionam para /login (fail-safe; evita crash do client).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPainelWeb =
    pathname.startsWith(PREFIXOS_ROTAS_PAINEL_WEB[0]) || pathname.startsWith(PREFIXOS_ROTAS_PAINEL_WEB[1])
  const isCaixaWeb = pathname === '/caixa' || pathname.startsWith('/caixa/')
  const isProtected = isPainelWeb || isCaixaWeb

  // Criar cliente Supabase DENTRO da função para evitar carregamento no escopo do arquivo
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const redirectLogin = () => {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  /** Preserva cookies da sessao (ex.: refresh do Supabase) ao redirecionar. */
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

  // Criar cliente Supabase com configuração simplificada para middleware
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }, // Importante para middleware
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (isProtected && !user) {
    return redirectLogin()
  }

  if (isProtected && user) {
    const { data: row } = await supabase
      .from('usuarios')
      .select('perfil')
      .eq('id', user.id)
      .maybeSingle()

    const perfil = typeof row?.perfil === 'string' ? row.perfil : 'OPERADOR'
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
