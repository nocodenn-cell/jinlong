import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected =
    pathname.startsWith('/gerente') ||
    pathname === '/caixa' ||
    pathname.startsWith('/caixa/')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const redirectLogin = () => {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (!supabaseConfigOk(supabaseUrl, supabaseAnonKey)) {
    if (isProtected) {
      return redirectLogin()
    }
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl!, supabaseAnonKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(
        cookiesToSet: {
          name: string
          value: string
          options?: Partial<{
            httpOnly: boolean
            secure: boolean
            sameSite: 'lax' | 'strict' | 'none'
            maxAge: number
            path: string
            domain: string
          }>
        }[],
      ) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (isProtected && !user) {
    return redirectLogin()
  }

  return response
}

export const config = {
  matcher: ['/gerente/:path*', '/caixa', '/caixa/:path*'],
}
