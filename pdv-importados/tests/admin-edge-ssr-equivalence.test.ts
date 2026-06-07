import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  fetchRawSession,
  normalizeAdminSession,
  normalizeSession,
  getCachedAdminNormalization,
  getCachedAdminSession,
} from '@/lib/admin/auth/sessionConsistency'
import {
  actionAdminDecision,
  apiAdminDecision,
  middlewareAdminDecision,
} from '@/lib/admin/policy/adminPolicy'

const gerenteUser = { id: 'mgr-1', email: 'gerente@test.local' }
const gerenteRow = { perfil: 'GERENTE', idioma_preferido: 'pt', loja_id: 'loja-1' }
const operadorUser = { id: 'op-1', email: 'op@test.local' }

function buildSupabaseMock(overrides: {
  getUser?: () => Promise<{ data: { user: unknown }; error: unknown }>
  single?: () => Promise<{ data: unknown; error: unknown }>
}) {
  const getUser = vi.fn(overrides.getUser)
  const single = vi.fn(overrides.single)
  return {
    auth: { getUser, signOut: vi.fn(async () => ({ error: null })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single })),
      })),
    })),
  } as unknown as SupabaseClient
}

function contractWithoutSource(
  contract: ReturnType<typeof normalizeAdminSession>['contract']
) {
  if (!contract) return null
  const { source: _source, ...rest } = contract
  return rest
}

describe('edge/ssr session equivalence layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizeAdminSession produz contrato equivalente (exceto source) para edge e ssr', () => {
    const raw = {
      status: 'authenticated' as const,
      user: gerenteUser,
      usuario: gerenteRow,
    }
    const edge = normalizeAdminSession(raw, 'edge')
    const ssr = normalizeAdminSession(raw, 'ssr')

    expect(edge.session).toEqual(ssr.session)
    expect(edge.authState).toBe(ssr.authState)
    expect(edge.perfil).toBe(ssr.perfil)
    expect(contractWithoutSource(edge.contract)).toEqual(contractWithoutSource(ssr.contract))
    expect(edge.contract?.source).toBe('edge')
    expect(ssr.contract?.source).toBe('ssr')
  })

  it('adminPolicy recebe decisão idêntica independente da origem (source)', () => {
    const raw = {
      status: 'authenticated' as const,
      user: gerenteUser,
      usuario: gerenteRow,
    }
    const edgeDecision = middlewareAdminDecision(normalizeAdminSession(raw, 'edge'), '/admin/dashboard')
    const ssrDecision = middlewareAdminDecision(normalizeAdminSession(raw, 'ssr'), '/admin/dashboard')

    expect(edgeDecision).toEqual(ssrDecision)
  })

  it('operador: mesma decisão edge vs ssr', () => {
    const raw = {
      status: 'authenticated' as const,
      user: operadorUser,
      usuario: { perfil: 'OPERADOR', idioma_preferido: 'pt', loja_id: null },
    }
    const edgeDecision = middlewareAdminDecision(normalizeAdminSession(raw, 'edge'), '/admin/vendas')
    const ssrDecision = middlewareAdminDecision(normalizeAdminSession(raw, 'ssr'), '/admin/vendas')

    expect(edgeDecision).toEqual(ssrDecision)
    expect(apiAdminDecision(normalizeAdminSession(raw, 'edge').session)).toEqual(
      apiAdminDecision(normalizeAdminSession(raw, 'ssr').session)
    )
    expect(actionAdminDecision(normalizeAdminSession(raw, 'edge').session)).toEqual(
      actionAdminDecision(normalizeAdminSession(raw, 'ssr').session)
    )
  })

  it('normalizeSession delega ao normalizador único', () => {
    const raw = {
      status: 'authenticated' as const,
      user: gerenteUser,
      usuario: gerenteRow,
    }
    expect(normalizeSession(raw)).toEqual(normalizeAdminSession(raw, 'ssr').session)
  })

  it('fetchRawSession + normalizeAdminSession(edge) === pipeline SSR cacheado', async () => {
    const supabase = buildSupabaseMock({
      getUser: async () => ({ data: { user: gerenteUser }, error: null }),
      single: async () => ({ data: gerenteRow, error: null }),
    })

    const rawEdge = await fetchRawSession(supabase)
    const normalizedEdge = normalizeAdminSession(rawEdge, 'edge')

    vi.mocked(createClient).mockResolvedValue(supabase)
    vi.resetModules()
    const mod = await import('@/lib/admin/auth/sessionConsistency')
    const normalizedSsr = await mod.getCachedAdminNormalization()
    const sessionSsr = await mod.getCachedAdminSession()

    expect(normalizedEdge.session).toEqual(normalizedSsr.session)
    expect(normalizedEdge.session).toEqual(sessionSsr)
    expect(contractWithoutSource(normalizedEdge.contract)).toEqual(
      contractWithoutSource(normalizedSsr.contract)
    )
    expect(normalizedEdge.authState).toBe(normalizedSsr.authState)
  })

  it('estados de erro produzem authState idêntico em edge e ssr', () => {
    const cases = [
      { status: 'anonymous' as const },
      { status: 'stale' as const },
      { status: 'auth_error' as const, error: new Error('auth') },
      {
        status: 'db_error' as const,
        user: gerenteUser,
        error: new Error('db'),
      },
    ]

    for (const raw of cases) {
      const edge = normalizeAdminSession(raw, 'edge')
      const ssr = normalizeAdminSession(raw, 'ssr')
      expect(edge.authState).toBe(ssr.authState)
      expect(edge.session).toBe(ssr.session)
      expect(edge.contract).toBe(ssr.contract)
    }
  })
})
