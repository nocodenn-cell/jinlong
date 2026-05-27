'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, LogIn, Mail, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Mensagens } from '@/i18n/getMessages'

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

/**
 * Login refatorado seguindo o design system Jīn Lóng:
 *   - Container: `caixa-oriental-root` (gradiente noturno + bloom âmbar)
 *   - Hero: dragão duplo dentro do frame premium com vinheta
 *   - Wordmark: 金龍 | Jīn Lóng (Noto Serif SC + Cinzel)
 *   - Card glass: `dragon-glass-card` (slate translúcido + blur 18px + borda âmbar)
 *   - Inputs: ícones Lucide (Mail, Lock) + foco anel âmbar
 *   - Botão: gradiente âmbar com ícone LogIn / Loader2
 *
 * Lógica de autenticação INALTERADA.
 */
export function LoginForm({ messages: m }: Props) {
  const L = m.login
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const avisoInatividade = searchParams.get('reason') === 'sessao_inatividade'

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    let supabase
    try {
      supabase = createClient()
    } catch (cfgErr) {
      const msg =
        cfgErr instanceof Error
          ? cfgErr.message
          : 'Configure o Supabase no arquivo .env.local na pasta do projeto e reinicie o servidor (npm run dev).'
      setErro(msg)
      setLoading(false)
      return
    }

    let authError
    try {
      const res = await supabase.auth.signInWithPassword({ email, password: senha })
      authError = res.error
    } catch (netErr) {
      const hint =
        netErr instanceof TypeError && netErr.message === 'Failed to fetch'
          ? ' Não foi possível contatar o Supabase (rede, URL em NEXT_PUBLIC_SUPABASE_URL ou extensão do navegador).'
          : ''
      setErro(`Falha de conexão com o servidor de autenticação.${hint}`)
      setLoading(false)
      return
    }

    if (authError) {
      setErro('Email ou senha incorretos')
      setLoading(false)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setErro('Não foi possível confirmar seu login. Atualize a página e tente novamente.')
      setLoading(false)
      return
    }

    const { data: u, error: perfilErr } = await supabase
      .from('usuarios')
      .select('perfil')
      .eq('id', user.id)
      .maybeSingle()

    if (perfilErr) {
      const code =
        perfilErr && typeof perfilErr === 'object' && 'code' in perfilErr
          ? String((perfilErr as { code?: unknown }).code ?? '')
          : ''
      const hintDev =
        process.env.NODE_ENV === 'development' && (perfilErr.message || code)
          ? ` Detalhe (dev): ${[perfilErr.message, code].filter(Boolean).join(' — ')}`
          : ''
      setErro(
        'Não foi possível carregar seu perfil no sistema. Se o problema continuar, avise o suporte (tabela de usuários).' +
          ' Erro 500 costuma indicar falha no banco (migrações, RLS ou indisponibilidade) — veja os logs do projeto no Supabase.' +
          hintDev,
      )
      setLoading(false)
      return
    }

    if (!u) {
      setErro(
        'Sua conta de login existe, mas ainda não está vinculada ao cadastro da loja. Peça ao administrador para criar seu usuário no painel.',
      )
      setLoading(false)
      return
    }

    const padraoPerfil = u.perfil === 'OPERADOR' ? '/caixa' : '/gerente'
    const destino = destinoAposLogin(searchParams.get('next'), padraoPerfil)

    router.push(destino)
    router.refresh()
  }

  return (
    <div
      className="caixa-oriental-root login-premium-root relative flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 py-12 sm:py-16"
      data-app-theme="noturno"
    >
      {/* Hero: dragão duplo com vinheta */}
      <div className="login-premium-art-wrap relative z-10">
        <div className="login-premium-dragon-frame">
          <div className="login-premium-dragon-media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/branding/brand-double-dragon.png"
              alt=""
              width={280}
              height={280}
              className="login-premium-dragon-img dragon-hero-mark"
              draggable={false}
            />
          </div>
          <div className="login-premium-vignette" aria-hidden />
        </div>
      </div>

      {/* Wordmark — 金龍 | Jīn Lóng */}
      <h1 className="login-premium-wordmark dragon-hero-subtitle relative z-10 mb-8 text-center">
        <span className="login-premium-wordmark-han">{m.brand.logo_subtitle}</span>
        <span className="mx-2 text-[#bfa76a]/45" aria-hidden>
          |
        </span>
        <span>Jīn Lóng</span>
      </h1>

      {/* Card glass — formulário */}
      <div className="dragon-glass-card login-premium-form-block relative z-10 w-full max-w-[400px] rounded-2xl p-7 sm:p-8">
        {avisoInatividade ? (
          <p
            className="login-premium-inactivity mb-6 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-center text-sm text-amber-200"
            role="status"
          >
            {L.sessao_inatividade}
          </p>
        ) : null}

        <form onSubmit={login} className="flex w-full flex-col gap-5">
          {/* E-mail */}
          <div className="flex flex-col gap-2">
            <label htmlFor="login-email" className="login-premium-label flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em]">
              <Mail className="h-3.5 w-3.5 opacity-70" aria-hidden />
              {L.email_placeholder}
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-400/60"
                aria-hidden
              />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={L.email_placeholder}
                autoComplete="username"
                required
                autoFocus
                className="login-premium-input app-input w-full rounded-lg pl-10 pr-3 transition-all focus:ring-2 focus:ring-amber-400/40 focus:ring-offset-0"
              />
            </div>
          </div>

          {/* Senha */}
          <div className="flex flex-col gap-2">
            <label htmlFor="login-senha" className="login-premium-label flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em]">
              <Lock className="h-3.5 w-3.5 opacity-70" aria-hidden />
              {L.senha_placeholder}
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-400/60"
                aria-hidden
              />
              <input
                id="login-senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder={L.senha_placeholder}
                autoComplete="current-password"
                required
                className="login-premium-input app-input w-full rounded-lg pl-10 pr-3 transition-all focus:ring-2 focus:ring-amber-400/40 focus:ring-offset-0"
              />
            </div>
          </div>

          {erro ? (
            <p
              className="rounded-lg border border-red-400/40 bg-red-950/30 px-3 py-2.5 text-center text-sm text-red-200"
              role="alert"
              aria-live="polite"
            >
              {erro}
            </p>
          ) : null}

          {/* Botão Entrar */}
          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="login-premium-submit app-btn-accent group relative mt-1 flex h-12 items-center justify-center gap-2 rounded-lg text-base font-semibold tracking-wide shadow-lg shadow-amber-900/30 transition-all hover:-translate-y-0.5 hover:shadow-amber-700/40 focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                <span>{L.entrando}</span>
              </>
            ) : (
              <>
                <LogIn className="h-5 w-5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                <span>{L.entrar}</span>
              </>
            )}
          </button>
        </form>

        {/* Rodapé sutil — selo 印 */}
        <div className="mt-6 flex items-center justify-center gap-2 opacity-60">
          <span
            className="text-xs tracking-[0.14em] text-amber-200/60"
            style={{ fontFamily: 'var(--font-serif-han)' }}
          >
            金龍 · {new Date().getFullYear()}
          </span>
        </div>
      </div>
    </div>
  )
}
