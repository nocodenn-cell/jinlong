'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DragonOuroLoader } from '@/components/branding/DragonOuroLoader'
import { AuthShell } from '@/components/auth/AuthShell'
import { PASSWORD_MIN_LENGTH, validateNewPassword } from '@/lib/auth/passwordPolicy'
import type { AppLocale } from '@shared-core/src/i18n'

export type AlterarSenhaLabels = {
  brandSubtitle: string
  titulo: string
  instrucao: string
  atual: string
  nova: string
  confirmar: string
  salvar: string
  salvando: string
  sucesso: string
  voltar: string
  erroAtual: string
  erroCurta: string
  erroMismatch: string
  erroGenerico: string
  erroEmail: string
}

type Props = {
  labels: AlterarSenhaLabels
  locale?: AppLocale
  email: string
  backHref: string
}

function mapPolicyError(code: string, L: AlterarSenhaLabels): string {
  if (code === 'TOO_SHORT') return L.erroCurta.replace('{n}', String(PASSWORD_MIN_LENGTH))
  if (code === 'MISMATCH') return L.erroMismatch
  return L.erroGenerico
}

export function AlterarSenhaForm({ labels: L, locale, email, backHref }: Props) {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirm, setConfirm] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setOk(false)

    if (!email) {
      setErro(L.erroEmail)
      return
    }

    const check = validateNewPassword(nova, confirm)
    if (!check.ok) {
      setErro(mapPolicyError(check.code, L))
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password: atual,
      })
      if (authErr) {
        setErro(L.erroAtual)
        return
      }

      const { error } = await supabase.auth.updateUser({ password: nova.trim() })
      if (error) {
        setErro(error.message || L.erroGenerico)
        return
      }

      setOk(true)
      setAtual('')
      setNova('')
      setConfirm('')
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
      ) : null}

      <form onSubmit={onSubmit} className="flex w-full flex-col gap-6" data-testid="change-password-form">
        <div className="flex flex-col gap-2">
          <label htmlFor="change-atual" className="login-premium-label">
            {L.atual}
          </label>
          <input
            id="change-atual"
            type="password"
            value={atual}
            onChange={(ev) => setAtual(ev.target.value)}
            autoComplete="current-password"
            required
            autoFocus
            className="login-premium-input"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="change-nova" className="login-premium-label">
            {L.nova}
          </label>
          <input
            id="change-nova"
            type="password"
            value={nova}
            onChange={(ev) => setNova(ev.target.value)}
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            className="login-premium-input"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="change-confirm" className="login-premium-label">
            {L.confirmar}
          </label>
          <input
            id="change-confirm"
            type="password"
            value={confirm}
            onChange={(ev) => setConfirm(ev.target.value)}
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
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
              {L.salvando}
            </>
          ) : (
            L.salvar
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link href={backHref} className="text-[#bfa76a]/80 underline underline-offset-2 hover:text-[#bfa76a]">
          {L.voltar}
        </Link>
      </p>
    </AuthShell>
  )
}
