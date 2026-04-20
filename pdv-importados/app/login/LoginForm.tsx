'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

export function LoginForm() {
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
      // fetch falhou (rede, URL errada, bloqueio, projeto pausado, etc.)
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
      setErro(
        'Não foi possível carregar seu perfil no sistema. Se o problema continuar, avise o suporte (tabela de usuários).',
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
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#020617',
        color: '#e5e7eb',
      }}
    >
      <div style={{ width: '100%', maxWidth: 360, padding: '0 16px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>PDV Importados</h1>
        <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 24 }}>
          Faça login para acessar o painel.
        </p>
        {avisoInatividade ? (
          <p
            style={{
              fontSize: 13,
              color: '#93c5fd',
              marginBottom: 16,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(30, 58, 138, 0.35)',
              border: '1px solid #1d4ed8',
            }}
          >
            Sua sessão foi encerrada por inatividade. Entre novamente.
          </p>
        ) : null}
        <form
          onSubmit={login}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="username"
            required
            autoFocus
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #374151',
              background: '#020617',
              color: '#e5e7eb',
              fontSize: 14,
            }}
          />
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            autoComplete="current-password"
            required
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #374151',
              background: '#020617',
              color: '#e5e7eb',
              fontSize: 14,
            }}
          />
          {erro && (
            <p style={{ color: '#f97373', fontSize: 13, textAlign: 'center' }}>{erro}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              padding: '10px 12px',
              borderRadius: 8,
              border: 'none',
              background: '#16a34a',
              color: '#ecfdf3',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
