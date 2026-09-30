'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DragonOuroLoader } from '@/components/branding/DragonOuroLoader'
import { AuthShell } from '@/components/auth/AuthShell'
import { buildAuthCallbackUrl } from '@/lib/auth/appOrigin'
import { ROUTES } from '@/lib/navigation/routes'
import type { AppLocale } from '@shared-core/src/i18n'

export type EsqueciSenhaLabels = {
  brandSubtitle: string
  titulo: string
  instrucao: string
  email: string
  enviar: string
  enviando: string
  sucesso: string
  voltar: string
  erroGenerico: string
  erroConfig: string
  erroRede: string
  erroLinkInvalido: string
  erroLinkExpirado: string
}

type Props = {
  labels: EsqueciSenhaLabels
  locale?: AppLocale
  initialError?: string | null
}

function mapQueryError(code: string | null | undefined, L: EsqueciSenhaLabels): string {
  if (code === 'link_invalido') return L.erroLinkInvalido
  if (code === 'link_expirado') return L.erroLinkExpirado
  return ''
}

export function EsqueciSenhaForm({ labels: L, locale, initialError }: Props) {
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState(() => mapQueryError(initialError, L))
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setOk(false)
    setLoading(true)
    try {
      let supabase
      try {
        supabase = createClient()
      } catch {
        setErro(L.erroConfig)
        return
      }

      const redirectTo = buildAuthCallbackUrl(ROUTES.auth.resetPassword)
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      if (error) {
        setErro(error.message || L.erroGenerico)
        return
      }
      setOk(true)
    } catch (netErr) {
      const rede =
        netErr instanceof TypeError && netErr.message === 'Failed to fetch' ? L.erroRede : L.erroGenerico
      setErro(rede)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell locale={locale} brandSubtitle={L.brandSubtitle}>
      <h2 className="mb-2 text-center text-lg font-semibold text-[#bfa76a]">{L.titulo}</h2>
      <p className="mb-6 text-center text-sm text-white/50">{L.instrucao}</p>

      {ok ? (
        <p className="mb-6 rounded-md px-3 py-2.5 text-center text-sm text-emerald-300/90" role="status">
          {L.sucesso}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-6" data-testid="forgot-password-form">
          <div className="flex flex-col gap-2">
            <label htmlFor="forgot-email" className="login-premium-label">
              {L.email}
            </label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder={L.email}
              autoComplete="username"
              required
              autoFocus
              className="login-premium-input"
            />
          </div>
          {erro ? (
            <p className="text-center text-sm text-destructive" role="alert">
              {erro}
            </p>
          ) : null}
          <button type="submit" disabled={loading} className="login-premium-submit flex items-center justify-center gap-2">
            {loading ? (
              <>
                <DragonOuroLoader className="text-black" iconClassName="h-4 w-4 text-black" />
                {L.enviando}
              </>
            ) : (
              L.enviar
            )}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href={ROUTES.auth.login} className="text-[#bfa76a]/80 underline underline-offset-2 hover:text-[#bfa76a]">
          {L.voltar}
        </Link>
      </p>
    </AuthShell>
  )
}
