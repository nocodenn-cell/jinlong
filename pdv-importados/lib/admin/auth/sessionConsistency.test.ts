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
} from './sessionConsistency'

const gerenteUser = { id: 'mgr-1', email: 'gerente@test.local' }
const gerenteRow = { perfil: 'GERENTE', idioma_preferido: 'pt', loja_id: 'loja-1' }

function buildSupabaseMock(overrides: {
  getUser?: () => Promise<{ data: { user: unknown }; error: unknown }>
  single?: () => Promise<{ data: unknown; error: unknown }>
  signOut?: () => Promise<{ error: unknown }>
}) {
  const getUser = vi.fn(overrides.getUser)
  const signOut = vi.fn(overrides.signOut ?? (async () => ({ error: null })))
  const single = vi.fn(overrides.single)
  return {
    auth: { getUser, signOut },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single })),
      })),
    })),
  } as unknown as SupabaseClient
}

async function loadActionLayer() {
  vi.resetModules()
  const assert = await import('./assertAdminSession')
  const context = await import('./getAdminSession')
  const consistency = await import('./sessionConsistency')
  return { ...assert, ...context, ...consistency }
}

describe('sessionConsistency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('normalizeSession', () => {
    it('retorna null para anônimo e stale', () => {
      expect(normalizeSession({ status: 'anonymous' })).toBeNull()
      expect(normalizeSession({ status: 'stale' })).toBeNull()
    })

    it('retorna null para operador', () => {
      const raw = {
        status: 'authenticated' as const,
        user: gerenteUser,
        usuario: { perfil: 'OPERADOR', idioma_preferido: 'pt', loja_id: null },
      }
      expect(normalizeSession(raw)).toBeNull()
    })

    it('normaliza gerente de forma idempotente', () => {
      const raw = {
        status: 'authenticated' as const,
        user: gerenteUser,
        usuario: gerenteRow,
      }
      const a = normalizeSession(raw)
      const b = normalizeSession(raw)
      expect(a).toEqual(b)
      expect(a).toMatchObject({
        userId: 'mgr-1',
        perfil: 'GERENTE',
        idioma: 'pt',
        lojaId: 'loja-1',
      })
    })
  })

  describe('normalizeAdminSession', () => {
    it('produz AdminSessionContract com role e permissions', () => {
      const raw = {
        status: 'authenticated' as const,
        user: gerenteUser,
        usuario: gerenteRow,
      }
      const normalized = normalizeAdminSession(raw, 'ssr')
      expect(normalized.contract).toMatchObject({
        userId: 'mgr-1',
        role: 'gerente',
        source: 'ssr',
      })
      expect(normalized.contract?.permissions.length).toBeGreaterThan(0)
      expect(normalized.authState).toBe('authenticated')
    })
  })

  describe('fetchRawSession', () => {
    it('marca sessão stale e dispara signOut', async () => {
      const supabase = buildSupabaseMock({
        getUser: async () => ({
          data: { user: null },
          error: { message: 'refresh token not found' },
        }),
      })
      const raw = await fetchRawSession(supabase)
      expect(raw).toEqual({ status: 'stale' })
      expect(supabase.auth.signOut).toHaveBeenCalled()
    })
  })

  it('must produce identical result across middleware, layout, and server action', async () => {
    const supabase = buildSupabaseMock({
      getUser: async () => ({ data: { user: gerenteUser }, error: null }),
      single: async () => ({ data: gerenteRow, error: null }),
    })

    const rawMiddleware = await fetchRawSession(supabase)
    const sessionMiddleware = normalizeSession(rawMiddleware)

    vi.mocked(createClient).mockResolvedValue(supabase)
    const { getRawSession: rawSsr, getCachedAdminSession: cached, assertAdminSession, getAdminSession } =
      await loadActionLayer()

    const rawLayout = await rawSsr()
    const sessionLayout = await cached()
    const actionResult = await assertAdminSession()
    const contextSession = await getAdminSession()

    expect(rawMiddleware).toEqual(rawLayout)
    expect(sessionMiddleware).toEqual(sessionLayout)
    expect(actionResult.ok).toBe(true)
    if (actionResult.ok) {
      expect(actionResult.session).toEqual(sessionLayout)
      expect(actionResult.context.session).toEqual(sessionLayout)
    }
    expect(contextSession).toEqual(sessionLayout)
  })

  it('must produce identical null across contexts when anonymous', async () => {
    const supabase = buildSupabaseMock({
      getUser: async () => ({ data: { user: null }, error: null }),
    })

    const rawMiddleware = await fetchRawSession(supabase)
    const sessionMiddleware = normalizeSession(rawMiddleware)

    vi.mocked(createClient).mockResolvedValue(supabase)
    const { getCachedAdminSession: cached, assertAdminSession } = await loadActionLayer()

    const sessionLayout = await cached()
    const actionResult = await assertAdminSession()

    expect(sessionMiddleware).toBeNull()
    expect(sessionLayout).toBeNull()
    expect(actionResult).toEqual({ ok: false, error: 'Não autorizado.' })
  })
})
