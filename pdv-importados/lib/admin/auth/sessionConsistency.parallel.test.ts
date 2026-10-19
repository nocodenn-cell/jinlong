import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { fetchRawSession } from './sessionConsistency'

/**
 * Perf (AUDITORIA_AUTH_PERFORMANCE.md): o perfil é lido em paralelo com
 * `auth.getUser()` usando o `sub` do token como dica. Estes testes garantem que a
 * otimização não afrouxa a regra: sem `getUser()` válido não há sessão, e perfil
 * lido para um id diferente do verificado é descartado.
 */

function tokenComSub(sub: string): string {
  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64url({ alg: 'ES256', typ: 'JWT' })}.${b64url({ sub, role: 'authenticated' })}.assinatura`
}

type Resultado = { data: unknown; error: unknown }

// Vínculos multiempresa: tabela ausente neste cenário ⇒ modo compatibilidade (não interfere na contagem).
const semVinculos = { select: () => ({ eq: () => ({ eq: async () => ({ data: null, error: { code: '42P01' } }) }) }) }

function buildClient(options: {
  sub?: string | null
  getSessionThrows?: boolean
  getUser: () => Promise<{ data: { user: unknown }; error: unknown }>
  perfilPorId: (id: string) => Resultado
  onGetUserStart?: () => void
}) {
  const eqCalls: string[] = []
  const single = vi.fn()
  const client = {
    auth: {
      getSession: vi.fn(async () => {
        if (options.getSessionThrows) throw new Error('storage indisponível')
        return {
          data: { session: options.sub ? { access_token: tokenComSub(options.sub) } : null },
          error: null,
        }
      }),
      getUser: vi.fn(async () => {
        options.onGetUserStart?.()
        return options.getUser()
      }),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn((tabela: string) => tabela === 'usuario_vinculos' ? semVinculos : ({
      select: vi.fn(() => ({
        eq: vi.fn((_col: string, id: string) => {
          eqCalls.push(id)
          return {
            single: single.mockImplementationOnce(async () => options.perfilPorId(id)),
          }
        }),
      })),
    })),
  }
  return { client: client as unknown as SupabaseClient, eqCalls }
}

const gerenteRow = { perfil: 'GERENTE', idioma_preferido: 'pt', loja_id: 'loja-1', ativo: true }

describe('fetchRawSession — perfil em paralelo com getUser', () => {
  it('dica igual ao usuário verificado: uma única leitura de perfil, iniciada antes do getUser', async () => {
    const ordem: string[] = []
    const { client, eqCalls } = buildClient({
      sub: 'user-1',
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
      perfilPorId: (id) => {
        ordem.push(`perfil:${id}`)
        return { data: gerenteRow, error: null }
      },
      onGetUserStart: () => ordem.push('getUser'),
    })

    const raw = await fetchRawSession(client)

    expect(raw).toMatchObject({ status: 'authenticated', usuario: gerenteRow })
    expect(eqCalls).toEqual(['user-1'])
    expect(ordem.indexOf('perfil:user-1')).toBeLessThan(ordem.indexOf('getUser'))
  })

  it('dica diferente do usuário verificado: descarta a leitura antecipada e relê com o id verificado', async () => {
    const { client, eqCalls } = buildClient({
      sub: 'outro-usuario',
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
      perfilPorId: (id) =>
        id === 'user-1'
          ? { data: gerenteRow, error: null }
          : { data: { ...gerenteRow, perfil: 'ADMIN' }, error: null },
    })

    const raw = await fetchRawSession(client)

    expect(raw).toMatchObject({ status: 'authenticated', usuario: gerenteRow })
    expect(eqCalls).toEqual(['outro-usuario', 'user-1'])
  })

  it('getUser falha: sessão stale mesmo com perfil antecipado disponível', async () => {
    const { client } = buildClient({
      sub: 'user-1',
      getUser: async () => ({ data: { user: null }, error: { message: 'refresh token not found' } }),
      perfilPorId: () => ({ data: gerenteRow, error: null }),
    })

    await expect(fetchRawSession(client)).resolves.toEqual({ status: 'stale' })
    expect(client.auth.signOut).toHaveBeenCalled()
  })

  it('getUser sem usuário: anônimo, ignorando o perfil antecipado', async () => {
    const { client } = buildClient({
      sub: 'user-1',
      getUser: async () => ({ data: { user: null }, error: null }),
      perfilPorId: () => ({ data: gerenteRow, error: null }),
    })

    await expect(fetchRawSession(client)).resolves.toEqual({ status: 'anonymous' })
  })

  it('leitura antecipada com erro: relê sequencialmente e preserva o db_error original', async () => {
    const erro = { message: 'falha de leitura' }
    const { client, eqCalls } = buildClient({
      sub: 'user-1',
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
      perfilPorId: () => ({ data: null, error: erro }),
    })

    const raw = await fetchRawSession(client)

    expect(raw).toMatchObject({ status: 'db_error', error: erro })
    expect(eqCalls).toEqual(['user-1', 'user-1'])
  })

  it('sem sessão legível nos cookies: fluxo sequencial de antes (getUser e depois perfil)', async () => {
    const { client, eqCalls } = buildClient({
      getSessionThrows: true,
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
      perfilPorId: () => ({ data: gerenteRow, error: null }),
    })

    const raw = await fetchRawSession(client)

    expect(raw).toMatchObject({ status: 'authenticated', usuario: gerenteRow })
    expect(eqCalls).toEqual(['user-1'])
  })

  it('bloqueio por conta inativa continua valendo com a leitura antecipada', async () => {
    const { normalizeAdminSession } = await import('./sessionConsistency')
    const { client } = buildClient({
      sub: 'user-1',
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
      perfilPorId: () => ({ data: { ...gerenteRow, ativo: false }, error: null }),
    })

    const normalized = normalizeAdminSession(await fetchRawSession(client), 'edge')

    expect(normalized.authState).toBe('blocked')
    expect(normalized.session).toBeNull()
  })
})
