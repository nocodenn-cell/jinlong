'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/forms'
import { ErrorState } from '@/components/ui/feedback'
import type { Mensagens } from '@/i18n/getMessages'
import type { AppLocale } from '@shared-core/src/i18n'
import { ROUTES } from '@shared-core/navigation/routes'
import { destinoPosLoginPorPerfil } from '@/lib/auth/painelGerencial'
import { isContaDesativada } from '@/core/auth/contaUsuario'
import { fmtTemplate } from '@/i18n/fmtTemplate'

/** Evita open redirect: só `/gerente...` ou `/caixa...`. */
function destinoAposLogin(nextRaw: string | null, padraoPerfil: string): string {
  if (!nextRaw || !nextRaw.startsWith('/') || nextRaw.startsWith('//')) {
    return padraoPerfil
  }
  if (/^\/(gerente|admin|caixa)(\/|$)/.test(nextRaw)) {
    return nextRaw
  }
  return padraoPerfil
}

type Props = {
  messages: Mensagens
  /** Locale BCP 47 resolvido pelo catalogAdapter (5.2c); opcional para testes. */
  locale?: AppLocale
}

export function LoginForm({ messages: m, locale }: Props) {
  const L = m.login
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const avisoInatividade = searchParams.get('reason') === 'sessao_inatividade'

  useEffect(() => {
    setHydrated(true)
  }, [])

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      let supabase
      try {
        supabase = createClient()
      } catch (cfgErr) {
        const msg = cfgErr instanceof Error ? cfgErr.message : L.esqueci_erro_config
        setErro(msg)
        return
      }

      let authError
      try {
        const res = await supabase.auth.signInWithPassword({
          email,
          password: senha,
        })
        authError = res.error
      } catch {
        setErro(L.esqueci_erro_rede)
        return
      }

      if (authError) {
        setErro(L.erro_credenciais)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setErro(L.erro_confirmacao)
        return
      }

      const { data: u, error: perfilErr } = await supabase
        .from('usuarios')
        .select('perfil, ativo, loja_id')
        .eq('id', user.id)
        .maybeSingle()

      if (perfilErr) {
        const code =
          perfilErr && typeof perfilErr === 'object' && 'code' in perfilErr
            ? String((perfilErr as { code?: unknown }).code ?? '')
            : ''
        console.error('[login.form.perfil]', {
          message: perfilErr.message,
          code,
          userId: user.id,
        })
        const hintDev =
          process.env.NODE_ENV === 'development' && (perfilErr.message || code)
            ? ` Detalhe (dev): ${[perfilErr.message, code].filter(Boolean).join(' — ')}`
            : ''
        setErro(L.erro_perfil + hintDev)
        return
      }

      if (!u) {
        setErro(L.erro_conta_nao_vinculada)
        return
      }

      if (isContaDesativada(u)) {
        await supabase.auth.signOut()
        setErro(L.erro_conta_desativada)
        return
      }

      if (!u.loja_id) {
        await supabase.auth.signOut()
        setErro(L.erro_sem_loja)
        return
      }

      const padraoPerfil = destinoPosLoginPorPerfil(u.perfil, {
        caixaHome: ROUTES.caixa.home,
        adminDashboard: ROUTES.admin.dashboard,
      })
      const destino = destinoAposLogin(searchParams.get('next'), padraoPerfil)

      router.push(destino)
      router.refresh()
    } catch (unexpected) {
      console.error('[login.form.excecao]', unexpected)
      setErro(
        unexpected instanceof Error
          ? fmtTemplate(L.erro_inesperado_detalhe, { detalhe: unexpected.message })
          : L.erro_inesperado,
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      data-theme="login"
      className="login-premium-root flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 py-10 sm:py-14"
      data-locale={locale}
    >
      <div className="flex w-full max-w-[380px] flex-col items-center">
        <div className="login-premium-art-wrap mb-2 w-full">
          <div className="login-premium-dragon-frame">
            <div className="login-premium-dragon-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/brand-double-dragon.png"
                alt=""
                width={240}
                height={240}
                className="login-premium-dragon-img mx-auto block"
                draggable={false}
              />
            </div>
            <div className="login-premium-vignette" aria-hidden />
          </div>
        </div>

        <h1 className="login-premium-wordmark mb-8 text-center text-h2">
          <span className="login-premium-wordmark-han">{m.brand.logo_subtitle}</span>
          <span className="login-wordmark-sep mx-2" aria-hidden>
            |
          </span>
          <span>Jīn Lóng</span>
        </h1>

        <div className="login-premium-form-block w-full">
          {avisoInatividade ? (
            <p className="login-inactivity mb-6 px-3 py-2.5 text-center" role="status">
              {L.sessao_inatividade}
            </p>
          ) : null}

          <form
            onSubmit={login}
            className="flex w-full flex-col gap-6"
            data-testid="login-form"
            data-login-hydrated={hydrated ? '1' : '0'}
          >
            <Field id="login-email" label={L.email_placeholder} required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={L.email_placeholder}
                autoComplete="username"
                required
                autoFocus
              />
            </Field>

            <div className="flex flex-col gap-2">
              <Field id="login-senha" label={L.senha_placeholder} required>
                <Input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder={L.senha_placeholder}
                  autoComplete="current-password"
                  required
                />
              </Field>
              <div className="flex justify-end">
                <Link href={ROUTES.auth.forgotPassword} className="login-link">
                  {L.esqueci_link}
                </Link>
              </div>
            </div>

            {erro ? <ErrorState dense description={erro} /> : null}

            <Button type="submit" variant="primary" loading={loading} className="mt-1 w-full">
              {loading ? L.entrando : L.entrar}
            </Button>
          </form>

          <p className="login-legal mt-6 text-center">
            Ao acessar a plataforma, você concorda com nossos{' '}
            <a href="/termos">Termos de Serviço</a> e{' '}
            <a href="/privacidade">Política de Privacidade</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
