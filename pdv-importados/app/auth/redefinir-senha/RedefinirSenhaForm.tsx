'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DragonOuroLoader } from '@/components/branding/DragonOuroLoader'
import { AuthShell } from '@/components/auth/AuthShell'
import { PASSWORD_MIN_LENGTH, validateNewPassword } from '@/lib/auth/passwordPolicy'
import { ROUTES } from '@/lib/navigation/routes'
import type { AppLocale } from '@shared-core/src/i18n'

export type RedefinirSenhaLabels = {
  brandSubtitle: string
  titulo: string
  instrucao: string
  novaSenha: string
  confirmar: string
  salvar: string
  salvando: string
  sucesso: string
  voltar: string
  erroSessao: string
  erroCurta: string
  erroMismatch: string
  erroGenerico: string
  erroMesmaSenha: string
  erroFraca: string
}

type Props = {
  labels: RedefinirSenhaLabels
  locale?: AppLocale
  hasSession: boolean
}

function mapPolicyError(code: string, L: RedefinirSenhaLabels): string {
  if (code === 'TOO_SHORT' || code === 'EMPTY') return L.erroCurta.replace('{n}', String(PASSWORD_MIN_LENGTH))
  if (code === 'MISMATCH') return L.erroMismatch
  return L.erroGenerico
}

/**
 * Traduz o erro do Supabase Auth para uma mensagem em português.
 * Nunca exibe a mensagem em inglês do Supabase: ela não diz ao usuário o que fazer.
 */
export function mapUpdatePasswordError(
  err: { code?: string; name?: string } | null | undefined,
  L: RedefinirSenhaLabels
): string {
  if (err?.code === 'same_password') return L.erroMesmaSenha
  if (err?.code === 'weak_password') return L.erroFraca
  if (err?.name === 'AuthSessionMissingError' || err?.code === 'session_not_found') return L.erroSessao
  return L.erroGenerico
}

export function RedefinirSenhaForm({ labels: L, locale, hasSession }: Props) {
  const router = useRouter()
  const [senha, setSenha] = useState('')
  const [confirm, setConfirm] = useState('')
  const [erro, setErro] = useState(() => (hasSession ? '' : L.erroSessao))
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    const check = validateNewPassword(senha, confirm)
    if (!check.ok) {
      setErro(mapPolicyError(check.code, L))
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: senha.trim() })
      if (error) {
        setErro(mapUpdatePasswordError(error, L))
        return
      }
      setOk(true)
      setTimeout(() => {
        router.push(ROUTES.auth.login)
        router.refresh()
      }, 1200)
    } catch {
      setErro(L.erroGenerico)
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
        // noValidate: a validação é a do app (mensagem em português abaixo do campo);
        // sem isso, o navegador bloqueia o envio com um balão nativo e a tela não mostra nada.
        <form onSubmit={onSubmit} noValidate className="flex w-full flex-col gap-6" data-testid="reset-password-form">
          <div className="flex flex-col gap-2">
            <label htmlFor="reset-senha" className="login-premium-label">
              {L.novaSenha}
            </label>
            <input
              id="reset-senha"
              type="password"
              value={senha}
              onChange={(ev) => setSenha(ev.target.value)}
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              disabled={!hasSession}
              className="login-premium-input"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="reset-confirm" className="login-premium-label">
              {L.confirmar}
            </label>
            <input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={(ev) => setConfirm(ev.target.value)}
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              disabled={!hasSession}
              className="login-premium-input"
            />
          </div>
          {erro ? (
            <p className="text-center text-sm text-destructive" role="alert">
              {erro}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading || !hasSession}
            className="login-premium-submit flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <DragonOuroLoader className="text-black" iconClassName="h-4 w-4 text-black" />
                {L.salvando}
              </>
            ) : (
              L.salvar
            )}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm">
        <Link
          href={hasSession ? ROUTES.auth.login : ROUTES.auth.forgotPassword}
          className="text-[#bfa76a]/80 underline underline-offset-2 hover:text-[#bfa76a]"
        >
          {L.voltar}
        </Link>
      </p>
    </AuthShell>
  )
}
