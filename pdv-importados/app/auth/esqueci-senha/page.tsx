import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { DragonOuroLoader } from '@/components/branding/DragonOuroLoader'
import { getMessagesForLocaleInput } from '@/i18n/catalogAdapter'
import { EsqueciSenhaForm } from './EsqueciSenhaForm'

type SearchParams = Promise<{ erro?: string }>

export default async function EsqueciSenhaPage({ searchParams }: { searchParams?: SearchParams }) {
  const cookieStore = await cookies()
  const idiomaCookie = cookieStore.get('idioma_preferido')?.value
  const { messages, locale } = getMessagesForLocaleInput(idiomaCookie)
  const L = messages.login
  const sp = searchParams ? await searchParams : {}

  return (
    <Suspense
      fallback={
        <div
          data-theme="login"
          className="login-premium-root flex min-h-[100dvh] flex-col items-center justify-center gap-3 text-sm text-[var(--color-brand)]"
        >
          <DragonOuroLoader iconClassName="h-6 w-6" />
          <span>{L.carregando_pagina}</span>
        </div>
      }
    >
      <EsqueciSenhaForm
        locale={locale}
        initialError={sp.erro ?? null}
        labels={{
          brandSubtitle: messages.brand.logo_subtitle,
          titulo: L.esqueci_titulo,
          instrucao: L.esqueci_instrucao,
          email: L.email_placeholder,
          enviar: L.esqueci_enviar,
          enviando: L.esqueci_enviando,
          sucesso: L.esqueci_sucesso,
          voltar: L.esqueci_voltar,
          erroGenerico: L.esqueci_erro,
          erroConfig: L.esqueci_erro_config,
          erroRede: L.esqueci_erro_rede,
          erroLinkInvalido: L.esqueci_erro_link_invalido,
          erroLinkExpirado: L.esqueci_erro_link_expirado,
        }}
      />
    </Suspense>
  )
}
