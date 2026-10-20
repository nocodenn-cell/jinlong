import Script from 'next/script'
import { TesteGratisForm } from './TesteGratisForm'
import { captchaAtivo } from '@/lib/cobranca/trialSignup'

export const metadata = { title: 'Teste grátis 15 dias · Jinlong PDV / 免费试用' }
export const dynamic = 'force-dynamic'

export default function TesteGratisPage() {
  // Captcha só liga com as DUAS chaves (site + secreta); sem elas a página funciona sem widget.
  const siteKey = captchaAtivo() ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!.trim() : null
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      {siteKey ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer /> : null}
      <TesteGratisForm turnstileSiteKey={siteKey} />
    </main>
  )
}
