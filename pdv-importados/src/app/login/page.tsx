'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
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
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })

    if (error) {
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

    const { data: u } = await supabase
      .from('usuarios')
      .select('perfil')
      .eq('id', user.id)
      .single()

    const next = searchParams.get('next')
    const destino =
      u?.perfil === 'OPERADOR'
        ? '/caixa'
        : next ?? '/gerente/produtos'

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

