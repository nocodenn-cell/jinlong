import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ROUTES } from '@/lib/navigation/routes'
import { parseEmailOtpType, safeAuthNextPath } from '@/lib/auth/emailLink'

/**
 * Valida o token_hash do e-mail (convite/recuperação) e cria a sessão.
 * Só aceita POST: scanners de e-mail (Gmail/Outlook) fazem GET e não consomem o link.
 */
export async function POST(request: NextRequest) {
  const { origin } = request.nextUrl
  const form = await request.formData()
  const tokenHash = String(form.get('token_hash') ?? '')
  const type = parseEmailOtpType(String(form.get('type') ?? ''))
  const next = safeAuthNextPath(String(form.get('next') ?? ''))
  const falha = (erro: string) =>
    NextResponse.redirect(`${origin}${ROUTES.auth.forgotPassword}?erro=${erro}`, 303)

  if (!tokenHash || !type) return falha('link_invalido')

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error) return falha('link_expirado')
    return NextResponse.redirect(`${origin}${next}`, 303)
  } catch {
    return falha('link_expirado')
  }
}
