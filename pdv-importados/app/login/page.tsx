import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { LoginForm } from './LoginForm'
import { Loading } from '@/components/ui/feedback'
import { getMessagesForLocaleInput } from '@/i18n/catalogAdapter'

/**
 * Login — referência visual Onda 3 (DS: Button, Field, Input, Loading, ErrorState).
 * Cookie `idioma_preferido` permanece legado (`pt` | `zh`);
 * resolução BCP 47 via shared-core (pt→pt-BR, zh→zh-CN, en-US→fallback PT).
 * Auth / fluxo / validações / rotas / i18n: inalterados.
 */
export default async function LoginPage() {
  const cookieStore = await cookies()
  const idiomaCookie = cookieStore.get('idioma_preferido')?.value
  const { messages, locale } = getMessagesForLocaleInput(idiomaCookie)

  return (
    <Suspense
      fallback={
        <div data-theme="login" className="login-premium-root" data-locale={locale}>
          <Loading label={messages.login.carregando_pagina} className="min-h-[100dvh]" />
        </div>
      }
    >
      <LoginForm messages={messages} locale={locale} />
    </Suspense>
  )
}
