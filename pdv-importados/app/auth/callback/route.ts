import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ROUTES } from '@/lib/navigation/routes'
import { safeAuthNextPath } from '@/lib/auth/emailLink'

const safeNextPath = (raw: string | null) => safeAuthNextPath(raw, ROUTES.auth.resetPassword)

/** Troca o code PKCE do e-mail de recuperação por sessão e redireciona. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  if (!code) {
    // Sem code (ex.: erro do Supabase no #fragmento ou link antigo de fluxo implícito):
    // o navegador preserva o fragmento no redirect e /auth/esqueci-senha o interpreta.
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
