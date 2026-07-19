import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ROUTES } from '@shared-core/navigation/routes'

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return ROUTES.auth.resetPassword
  }
  if (/^\/(auth|login|admin|caixa|gerente)(\/|$)/.test(raw)) return raw
  return ROUTES.auth.resetPassword
}

/** Troca o code PKCE do e-mail de recuperação por sessão e redireciona. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(`${origin}${ROUTES.auth.forgotPassword}?erro=link_invalido`)
  }

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(`${origin}${ROUTES.auth.forgotPassword}?erro=link_expirado`)
    }
    return NextResponse.redirect(`${origin}${next}`)
  } catch {
    return NextResponse.redirect(`${origin}${ROUTES.auth.forgotPassword}?erro=link_expirado`)
  }
}
