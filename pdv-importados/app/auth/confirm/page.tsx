import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getMessagesForLocaleInput } from '@/i18n/catalogAdapter'
import { AuthShell } from '@/components/auth/AuthShell'
import { ROUTES } from '@/lib/navigation/routes'
import { parseEmailOtpType, safeAuthNextPath } from '@/lib/auth/emailLink'
import { ConfirmarButton } from './ConfirmarButton'

type SearchParams = Promise<{ token_hash?: string; type?: string; next?: string }>

export const dynamic = 'force-dynamic'

/**
 * Página de destino dos links de e-mail (template com {{ .TokenHash }}).
 * Não consome o token no GET: exige clique do usuário (POST /auth/confirm/verify).
 */
export default async function ConfirmPage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = searchParams ? await searchParams : {}
  const tokenHash = sp.token_hash ?? ''
  const type = parseEmailOtpType(sp.type)
  if (!tokenHash || !type) redirect(`${ROUTES.auth.forgotPassword}?erro=link_invalido`)
  const next = safeAuthNextPath(sp.next)

  const cookieStore = await cookies()
  const { messages, locale } = getMessagesForLocaleInput(cookieStore.get('idioma_preferido')?.value)
  const L = messages.login

  return (
    <AuthShell locale={locale} brandSubtitle={messages.brand.logo_subtitle}>
      <h2 className="mb-2 text-center text-lg font-semibold text-[#bfa76a]">{L.confirmar_titulo}</h2>
      <p className="mb-6 text-center text-sm text-white/50">{L.confirmar_instrucao}</p>
      <form method="post" action="/auth/confirm/verify" className="flex w-full flex-col" data-testid="confirm-email-link-form">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next} />
        <ConfirmarButton label={L.confirmar_botao} pendingLabel={L.confirmar_enviando} />
      </form>
    </AuthShell>
  )
}
