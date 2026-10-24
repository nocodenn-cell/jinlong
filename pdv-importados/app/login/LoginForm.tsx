'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/forms'
import { ErrorState } from '@/components/ui/feedback'
import type { Mensagens } from '@/i18n/getMessages'
import type { AppLocale } from '@shared-core/src/i18n'
import { ROUTES } from '@/lib/navigation/routes'
import { destinoPosLoginPorPerfil } from '@/lib/auth/painelGerencial'
import { hubLoginUrl } from '@/lib/auth/painelPlataforma'
import { isContaDesativada } from '@/core/auth/contaUsuario'
import { fmtTemplate } from '@/i18n/fmtTemplate'
import { toLegacyIdioma } from '@shared-core/src/i18n'
import { LoginLanguageSwitch } from './LoginLanguageSwitch'

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
  const idiomaAtual = toLegacyIdioma(locale ?? 'pt-BR')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; senha?: string }>({})
  const [mostrarSenha, setMostrarSenha] = useState(false)
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
    if (loading) return
    setErro('')

    const novosErros: { email?: string; senha?: string } = {}
    if (!email.trim()) {
      novosErros.email = L.email_obrigatorio
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      novosErros.email = L.email_invalido
    }
    if (!senha) {
      novosErros.senha = L.senha_obrigatoria
    }
    setFieldErrors(novosErros)
    if (novosErros.email || novosErros.senha) return

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
        // Administrador da plataforma (sem loja no ERP) → painel gerencial (hub).
        const hub = hubLoginUrl()
        if (hub) {
          const { data: admin } = await supabase.rpc('is_commercial_admin')
          if (admin === true) {
            await supabase.auth.signOut()
            window.location.assign(hub)
            return
          }
        }
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
      {/* Skip link próprio, traduzido. O da layout raiz fica oculto nesta tela (ver login-theme.css). */}
      <a href="#main-content" className="skip-link">
        {L.ir_conteudo}
      </a>
      <main id="main-content" className="flex w-full max-w-[380px] flex-col items-center">
        <div className="mb-4 flex w-full justify-end">
          <LoginLanguageSwitch idiomaAtual={idiomaAtual} label={L.idioma_selecionar} />
        </div>
        <div className="login-premium-art-wrap mb-2 w-full">
          <div className="login-premium-dragon-frame">
            <div className="login-premium-dragon-media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/brand-double-dragon-480.webp"
                alt=""
                width={240}
                height={240}
                fetchPriority="high"
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
            noValidate
            className="flex w-full flex-col gap-6"
            data-testid="login-form"
            data-login-hydrated={hydrated ? '1' : '0'}
          >
            <Field id="login-email" label={L.email_placeholder} required error={fieldErrors.email}>
              <Input
                type="email"
                name="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setFieldErrors((prev) => ({ ...prev, email: undefined }))
                }}
                placeholder={L.email_placeholder}
                autoComplete="username"
                required
                autoFocus
              />
            </Field>

            <div className="flex flex-col gap-2">
              <div className="relative">
                <Field id="login-senha" label={L.senha_placeholder} required error={fieldErrors.senha}>
                  <Input
                    type={mostrarSenha ? 'text' : 'password'}
                    name="password"
                    value={senha}
                    onChange={(e) => {
                      setSenha(e.target.value)
                      setFieldErrors((prev) => ({ ...prev, senha: undefined }))
                    }}
                    placeholder={L.senha_placeholder}
                    autoComplete="current-password"
                    required
                    className="pr-11"
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  aria-label={mostrarSenha ? L.senha_ocultar : L.senha_mostrar}
                  aria-pressed={mostrarSenha}
                  className="login-senha-toggle"
                >
                  {mostrarSenha ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </div>
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
            {L.consentimento_pre}{' '}
            <a href="/termos">{L.consentimento_termos}</a> {L.consentimento_e}{' '}
            <a href="/privacidade">{L.consentimento_privacidade}</a>.
          </p>
        </div>
      </main>
    </div>
  )
}
