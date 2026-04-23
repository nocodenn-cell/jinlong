'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/branding/Logo'
import { DragonOuroLoader } from '@/components/branding/DragonOuroLoader'
import { DragonIcon } from '@/components/icons/DragonIcon'
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
      if (process.env.NODE_ENV === 'development') {
        console.error('[login] falha ao consultar public.usuarios:', perfilErr)
      }
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
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-[380px] flex flex-col items-center">
        <div className="dragon-hero-mark mb-8 flex flex-col items-center">
          <DragonIcon className="h-28 w-28 sm:h-32 sm:w-32 text-[#F59E0B]" />
        </div>

        <div className="mb-8 text-center w-full">
          <Logo variant="wordmark" logoSubtitle={m.brand.logo_subtitle} />
          <p className="mt-4 text-sm text-slate-400 tracking-wide">{L.subtitulo}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-amber-500/80">
            {L.tagline}
          </p>
        </div>

        {avisoInatividade ? (
          <p
            className="mb-5 w-full rounded-lg border border-sky-600/50 bg-sky-950/40 px-3 py-2.5 text-center text-sm text-sky-200"
            role="status"
          >
            {L.sessao_inatividade}
          </p>
        ) : null}

        <form onSubmit={login} className="w-full flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={L.email_placeholder}
            autoComplete="username"
            required
            autoFocus
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none ring-emerald-500/30 focus:border-emerald-600/60 focus:ring-2"
          />
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder={L.senha_placeholder}
            autoComplete="current-password"
            required
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none ring-emerald-500/30 focus:border-emerald-600/60 focus:ring-2"
          />
          {erro ? (
            <p className="text-center text-sm text-red-300/95" role="alert">
              {erro}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="mt-1 flex items-center justify-center gap-2 rounded-lg border-0 bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? (
              <>
                <DragonOuroLoader iconClassName="h-4 w-4" />
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
