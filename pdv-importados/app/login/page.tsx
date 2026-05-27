import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { LoginForm } from './LoginForm'
import { DragonOuroLoader } from '@/components/branding/DragonOuroLoader'
import { normalizeIdioma } from '@/src/lib/idioma/normalizeIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'

export default async function LoginPage() {
  const cookieStore = await cookies()
  const idiomaCookie = cookieStore.get('idioma_preferido')?.value
  const idioma = normalizeIdioma(idiomaCookie)
  const messages = getMessages(idioma)

  return (
    <Suspense
      fallback={
        <div className="login-premium-root flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-black text-sm text-[#bfa76a]/80">
          <DragonOuroLoader iconClassName="h-6 w-6" />
          <span>{messages.login.carregando_pagina}</span>
        </div>
      }
    >
      <LoginForm messages={messages} />
    </Suspense>
  )
}
