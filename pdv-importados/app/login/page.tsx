import { Suspense } from 'react'
import { LoginForm } from './LoginForm'
import { DragonOuroLoader } from '@/components/branding/DragonOuroLoader'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'

export default async function LoginPage() {
  const { idioma } = await getUsuarioIdioma()
  const messages = getMessages(idioma)

  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-slate-950 text-slate-400 text-sm gap-3">
          <DragonOuroLoader iconClassName="h-6 w-6" />
          <span>{messages.login.carregando_pagina}</span>
        </div>
      }
    >
      <LoginForm messages={messages} />
    </Suspense>
  )
}
