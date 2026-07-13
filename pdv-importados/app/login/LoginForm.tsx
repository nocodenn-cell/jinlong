'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DragonOuroLoader } from '@/components/branding/DragonOuroLoader'
import type { Mensagens } from '@/i18n/getMessages'
import { ROUTES } from '@shared-core/navigation/routes'
import { destinoPosLoginPorPerfil } from '@/lib/auth/painelGerencial'

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
}

export function LoginForm({ messages: m }: Props) {
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
        const msg =
          cfgErr instanceof Error
            ? cfgErr.message
            : 'Configure o Supabase no arquivo .env.local na pasta do projeto e reinicie o servidor (npm run dev).'
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
      } catch (netErr) {
        const hint =
          netErr instanceof TypeError && netErr.message === 'Failed to fetch'
            ? ' Não foi possível contatar o Supabase (rede, URL em NEXT_PUBLIC_SUPABASE_URL ou extensão do navegador).'
            : ''
        setErro(`Falha de conexão com o servidor de autenticação.${hint}`)
        return
      }

      if (authError) {
        setErro('Email ou senha incorretos')
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setErro('Não foi possível confirmar seu login. Atualize a página e tente novamente.')
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
        setErro(
          'Não foi possível carregar seu perfil no sistema. Se o problema continuar, avise o suporte (tabela de usuários).' +
            ' Erro 500 costuma indicar falha no banco (migrações, RLS ou indisponibilidade) — veja os logs do projeto no Supabase.' +
            hintDev,
        )
        return
      }

      if (!u) {
        setErro(
          'Sua conta de login existe, mas ainda não está vinculada ao cadastro da loja. Peça ao administrador para criar seu usuário no painel.',
        )
        return
      }

      if (u.ativo === false) {
        await supabase.auth.signOut()
        setErro('Sua conta está desativada. Fale com o administrador da loja para reativar o acesso.')
        return
      }

      if (!u.loja_id) {
        await supabase.auth.signOut()
        setErro(
          'Sua conta ainda não está vinculada a uma loja. Peça ao administrador para concluir o cadastro antes de acessar.',
        )
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
          ? `Falha inesperada no login: ${unexpected.message}`
          : 'Falha inesperada no login. Tente novamente.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-premium-root flex min-h-[100dvh] w-full flex-col items-center justify-center bg-black px-4 py-10 sm:py-14">
      <div className="flex w-full max-w-[380px] flex-col items-center">

        {/* 1 — Hero dragão */}
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

        {/* 2 — Wordmark */}
        <h1 className="login-premium-wordmark mb-8 text-center text-2xl">
          <span className="login-premium-wordmark-han">{m.brand.logo_subtitle}</span>
          <span className="mx-2 text-[#bfa76a]/45" aria-hidden>|</span>
          <span>Jīn Lóng</span>
        </h1>

        {/* 3 — Formulário */}
        <div className="login-premium-form-block w-full">
          {avisoInatividade ? (
            <p className="login-premium-inactivity mb-6 rounded-md px-3 py-2.5 text-center text-sm" role="status">
              {L.sessao_inatividade}
            </p>
          ) : null}

          <form
            onSubmit={login}
            className="flex w-full flex-col gap-6"
            data-testid="login-form"
            data-login-hydrated={hydrated ? '1' : '0'}
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="login-email" className="login-premium-label">
                {L.email_placeholder}
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={L.email_placeholder}
                autoComplete="username"
                required
                autoFocus
                className="login-premium-input"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="login-senha" className="login-premium-label">
                {L.senha_placeholder}
              </label>
              <input
                id="login-senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder={L.senha_placeholder}
                autoComplete="current-password"
                required
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
              disabled={loading}
              className="login-premium-submit flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <DragonOuroLoader className="text-black" iconClassName="h-4 w-4 text-black" />
                  {L.entrando}
                </>
              ) : (
                L.entrar
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-white/25">
            Ao acessar a plataforma, você concorda com nossos{' '}
            <a
              href="/termos"
              className="text-white/40 underline underline-offset-2 transition-colors hover:text-white/60"
            >
              Termos de Serviço
            </a>{' '}
            e{' '}
            <a
              href="/privacidade"
              className="text-white/40 underline underline-offset-2 transition-colors hover:text-white/60"
            >
              Política de Privacidade
            </a>
            .
          </p>
        </div>

      </div>
    </div>
  )
}
