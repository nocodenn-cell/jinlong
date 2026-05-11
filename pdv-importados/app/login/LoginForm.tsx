'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { DragonOuroLoader } from '@/components/branding/DragonOuroLoader'
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
    <div className="login-premium-root flex min-h-[100dvh] w-full flex-col items-center bg-black px-4 pb-12 pt-8 sm:pb-16 sm:pt-10">
      <div className="login-premium-art-wrap flex w-full max-w-3xl flex-col items-center">
        <div className="login-premium-dragon-frame w-full">
          <div className="login-premium-dragon-outer relative mx-auto h-[min(68vh,680px)] w-full max-w-[min(92vw,520px)] sm:h-[min(72vh,720px)]">
            <div className="login-premium-dragon-media relative h-full w-full">
              <Image
                src="/branding/dragon-jinlong-login-hero.png"
                alt={L.nav_marca}
                fill
                priority
                sizes="(max-width: 640px) 88vw, 500px"
                className="login-premium-dragon-img object-contain object-center"
              />
              <div className="login-premium-vignette" aria-hidden />
            </div>
          </div>
        </div>

        <h1 className="login-premium-wordmark mt-5 max-w-md text-center text-base leading-snug sm:mt-6 sm:text-lg">
          <span className="inline-block">Jīn Lóng</span>
          <span className="mx-2 inline-block align-middle text-[#bfa76a]/45" aria-hidden>
            |
          </span>
          <span className="login-premium-wordmark-han inline-block align-middle">{m.brand.logo_subtitle}</span>
        </h1>
      </div>

      <div className="login-premium-form-block mt-9 w-full max-w-[380px] sm:mt-11">
        {avisoInatividade ? (
          <p className="login-premium-inactivity mb-6 rounded-md px-3 py-2.5 text-center text-sm" role="status">
            {L.sessao_inatividade}
          </p>
        ) : null}

        <form onSubmit={login} className="flex w-full flex-col gap-6">
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
      </div>
    </div>
  )
}
