'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/** Evita open redirect: só `/gerente...` ou `/caixa...`. */
function destinoAposLogin(nextRaw: string | null, padraoPerfil: string): string {
  if (!nextRaw || !nextRaw.startsWith('/') || nextRaw.startsWith('//')) {
    return padraoPerfil
  }
  if (/^\/(gerente|caixa)(\/|$)/.test(nextRaw)) {
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

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    let supabase
    try {
      supabase = createClient()
    } catch (cfgErr) {
      const msg =
        cfgErr instanceof Error ? cfgErr.message : 'Configure Supabase em .env.local e reinicie o dev.'
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
      setErro('Falha ao obter usuário')
      setLoading(false)
      return
    }

    const { data: u, error: perfilErr } = await supabase
      .from('usuarios')
      .select('perfil')
      .eq('id', user.id)
      .maybeSingle()

    if (perfilErr) {
      setErro('Não foi possível carregar seu perfil. Verifique a tabela usuarios no Supabase.')
      setLoading(false)
      return
    }

    if (!u) {
      setErro('Usuário sem cadastro em usuarios. Crie a linha no banco com o mesmo id do Auth.')
      setLoading(false)
      return
    }

    const padraoPerfil = u.perfil === 'OPERADOR' ? '/caixa' : '/gerente/produtos'
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
        <form
          onSubmit={login}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
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
