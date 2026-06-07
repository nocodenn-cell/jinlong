import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchRawSession,
  normalizeAdminSession,
} from '@/lib/admin/auth/sessionConsistency'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'

const gerenteUser = { id: 'mgr-1', email: 'gerente@test.local' }
const gerenteRow = { perfil: 'GERENTE', idioma_preferido: 'pt', loja_id: 'loja-1' }

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assertSessionInvariant<T>(sessionA: T, sessionB: T, sessionC: T) {
  expect(sessionA).toEqual(sessionB)
  expect(sessionB).toEqual(sessionC)
}

function buildSupabaseClient(options: {
  getUser: () => Promise<{ data: { user: unknown }; error: unknown }>
  signOut?: () => Promise<{ error: unknown }>
}) {
  const getUser = vi.fn(options.getUser)
  const signOut = vi.fn(options.signOut ?? (async () => ({ error: null })))
  return {
    auth: { getUser, signOut },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: gerenteRow, error: null })),
        })),
      })),
    })),
    getUserSpy: getUser,
  } as unknown as SupabaseClient & { getUserSpy: ReturnType<typeof vi.fn> }
}

/** Simula store de auth mutável entre requests (login/logout). */
class AuthSessionStore {
  private authenticated = false

  login() {
    this.authenticated = true
  }

  logout() {
    this.authenticated = false
  }

  isAuthenticated() {
    return this.authenticated
  }

  createClient(getUserDelayMs = 8): SupabaseClient & { getUserSpy: ReturnType<typeof vi.fn> } {
    const self = this
    return buildSupabaseClient({
      getUser: async () => {
        await delay(getUserDelayMs)
        if (!self.authenticated) {
          return { data: { user: null }, error: null }
        }
        return { data: { user: gerenteUser }, error: null }
      },
      signOut: async () => {
        self.logout()
        return { error: null }
      },
    })
  }
}

async function withRequestScope<T>(
  supabase: SupabaseClient,
  fn: (api: {
    getCachedAdminSession: () => Promise<import('@/lib/admin/auth/types').AdminSession | null>
    getRawSession: () => Promise<import('@/lib/admin/auth/sessionConsistency').RawSession>
  }) => Promise<T>
): Promise<T> {
  vi.resetModules()
  vi.mocked(createClient).mockResolvedValue(supabase)
  const mod = await import('@/lib/admin/auth/sessionConsistency')
  return fn(mod)
}

// --- middleware mock (edge) --------------------------------------------------

const edgeGetUser = vi.fn()
const edgeSignOut = vi.fn()
const edgeSingle = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: edgeGetUser, signOut: edgeSignOut },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: edgeSingle })),
      })),
    })),
  })),
}))

async function runMiddleware(pathname: string) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  const { middleware } = await import('../middleware')
  return middleware(new NextRequest(`https://pdv.test${pathname}`))
}

function redirectUrl(response: Response): string | null {
  if (response.status < 300 || response.status >= 400) return null
  return response.headers.get('location')
}

// =============================================================================

describe('admin auth concurrency', () => {
  beforeEach(() => {
    edgeGetUser.mockReset()
    edgeSignOut.mockReset()
    edgeSingle.mockReset()
    edgeSignOut.mockResolvedValue({ error: null })
  })

  describe('1. sessão simultânea (race condition)', () => {
    it('request A + logout B + dashboard C — sem sessão fantasma', async () => {
      const store = new AuthSessionStore()
      store.login()

      const sessionA = withRequestScope(store.createClient(15), ({ getCachedAdminSession }) =>
        getCachedAdminSession()
      )

      const logoutB = delay(5).then(async () => {
        const client = store.createClient(0)
        await client.auth.signOut()
      })

      await Promise.all([sessionA, logoutB])
      expect(store.isAuthenticated()).toBe(false)

      const postLogoutClient = store.createClient(0)
      const sessionC = await withRequestScope(postLogoutClient, ({ getCachedAdminSession }) =>
        getCachedAdminSession()
      )
      const sessionCRepeat = await withRequestScope(postLogoutClient, ({ getCachedAdminSession }) =>
        getCachedAdminSession()
      )

      expect(sessionC).toBeNull()
      assertSessionInvariant(sessionC, sessionCRepeat, null)

      edgeGetUser.mockResolvedValue({ data: { user: null }, error: null })
      const mw = await runMiddleware('/admin/dashboard')
      expect(redirectUrl(mw)).toContain('/login')
    })
  })

  describe('2. edge vs SSR simultâneo', () => {
    it('middleware e layout produzem mesmo resultado lógico em paralelo', async () => {
      edgeGetUser.mockResolvedValue({
        data: { user: gerenteUser },
        error: null,
      })
      edgeSingle.mockResolvedValue({ data: gerenteRow, error: null })

      const edgeSupabase = buildSupabaseClient({
        getUser: async () => ({ data: { user: gerenteUser }, error: null }),
      })

      const ssrSupabase = buildSupabaseClient({
        getUser: async () => ({ data: { user: gerenteUser }, error: null }),
      })

      const [rawEdge, sessionSsr] = await Promise.all([
        fetchRawSession(edgeSupabase),
        withRequestScope(ssrSupabase, ({ getCachedAdminSession }) => getCachedAdminSession()),
      ])

      const normalizedEdge = normalizeAdminSession(rawEdge, 'edge')
      const perfilEdge = normalizedEdge.perfil ?? 'OPERADOR'
      const perfilSsr = sessionSsr?.perfil ?? 'OPERADOR'

      assertSessionInvariant(normalizedEdge.session, sessionSsr, normalizedEdge.session)
      expect(isPerfilPainelGerencial(perfilEdge)).toBe(true)
      expect(perfilEdge).toBe(perfilSsr)

      const mw = await runMiddleware('/admin/dashboard')
      expect(redirectUrl(mw)).toBeNull()
    })
  })

  describe('3. cache invalidation safety', () => {
    it('múltiplas chamadas getCachedAdminSession retornam resultado idêntico no request boundary', async () => {
      const store = new AuthSessionStore()
      store.login()
      const supabase = store.createClient(0)

      vi.resetModules()
      vi.mocked(createClient).mockResolvedValue(supabase)
      const { getCachedAdminSession, getRawSession } = await import('@/lib/admin/auth/sessionConsistency')

      const sessionA = await getCachedAdminSession()
      const sessionB = await getCachedAdminSession()
      const sessionC = await getCachedAdminSession()

      assertSessionInvariant(sessionA, sessionB, sessionC)
      expect(sessionA).toMatchObject({ userId: 'mgr-1', perfil: 'GERENTE' })

      const rawA = await getRawSession()
      const rawB = await getRawSession()
      expect(rawA).toEqual(rawB)
    })

    it('novo request boundary após logout invalida cache — leituras consistentes', async () => {
      const store = new AuthSessionStore()
      store.login()

      const sessionBefore = await withRequestScope(store.createClient(0), ({ getCachedAdminSession }) =>
        getCachedAdminSession()
      )
      expect(sessionBefore).not.toBeNull()

      store.logout()

      const sessionA = await withRequestScope(store.createClient(0), ({ getCachedAdminSession }) =>
        getCachedAdminSession()
      )
      const sessionB = await withRequestScope(store.createClient(0), ({ getCachedAdminSession }) =>
        getCachedAdminSession()
      )
      const sessionC = await withRequestScope(store.createClient(0), ({ getCachedAdminSession }) =>
        getCachedAdminSession()
      )

      assertSessionInvariant(sessionA, sessionB, sessionC)
      expect(sessionA).toBeNull()
    })
  })
})
