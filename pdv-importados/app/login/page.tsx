import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { LoginForm } from './LoginForm'
import { DragonOuroLoader } from '@/components/branding/DragonOuroLoader'
import { getMessagesForLocaleInput } from '@/i18n/catalogAdapter'

/**
 * Login — primeiro consumidor do núcleo i18n (Missão 5.2c).
 * Cookie `idioma_preferido` permanece legado (`pt` | `zh`);
 * resolução BCP 47 via shared-core (pt→pt-BR, zh→zh-CN, en-US→fallback PT).
 */
export default async function LoginPage() {
  const cookieStore = await cookies()
  const idiomaCookie = cookieStore.get('idioma_preferido')?.value
  const { messages, locale } = getMessagesForLocaleInput(idiomaCookie)

  return (
    <Suspense
      fallback={
        <div
          className="login-premium-root flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-black text-sm text-[#bfa76a]/80"
          data-locale={locale}
        >
          <DragonOuroLoader iconClassName="h-6 w-6" />
          <span>{messages.login.carregando_pagina}</span>
        </div>
      }
    >
      <LoginForm messages={messages} locale={locale} />
    </Suspense>
  )
}
