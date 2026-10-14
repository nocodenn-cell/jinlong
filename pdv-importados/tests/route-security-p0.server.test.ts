/**
 * Sprint P0 — autorização no servidor independente do middleware.
 *
 * Server Actions podem ser chamadas por POST em qualquer caminho (inclusive fora
 * do matcher), e o middleware pode falhar/ser contornado: páginas, layouts e
 * actions precisam negar sozinhos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Normalization = {
  session: { userId: string; perfil: string; lojaId: string | null; idioma: 'pt' } | null
  authState: string
}

const mockNormalization = vi.fn<() => Promise<Normalization>>()
const mockGetUser = vi.fn()
const mockMaybeSingle = vi.fn()
const mockSignOut = vi.fn()
const mockFrom = vi.fn()
const mockReaderList = vi.fn()

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    const err = new Error('NEXT_REDIRECT') as Error & { digest: string }
    err.digest = `NEXT_REDIRECT;${url}`
    throw err
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/admin/auth/sessionConsistency', () => ({
  getCachedAdminNormalization: () => mockNormalization(),
  getCachedAdminSession: async () => (await mockNormalization()).session,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser, signOut: mockSignOut },
    from: (t: string) => {
      mockFrom(t)
      return { select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }
    },
  }),
}))

vi.mock('@/app/admin/financeiro/payableReader', () => ({
  createPayableReader: () => ({ list: mockReaderList }),
  readPayablePayments: vi.fn(),
}))
vi.mock('@/app/admin/financeiro/payablePayment', () => ({ createPayablePaymentService: vi.fn() }))

vi.mock('@/app/caixa/CaixaPageClient', () => ({ CaixaPageClient: () => null }))
vi.mock('@/idioma/usuarioIdioma', () => ({ getUsuarioIdioma: async () => ({ idioma: 'pt' }) }))
vi.mock('@/i18n/getMessages', () => ({ getMessages: () => ({}) }))

vi.mock('@/components/ui/admin-v2', () => ({
  AdminV2Shell: ({ children }: { children: unknown }) => children,
  AdminToastViewport: () => null,
}))
vi.mock('@/lib/admin/sinaisVisuaisAdmin', () => ({
  lerFlagsVisuaisPdv: async () => ({ data: null }),
  contarEstoqueBaixo: async () => ({ count: 0 }),
}))
vi.mock('@/components/gerente/GerenteLayoutShell', () => ({
  GerenteLayoutShell: ({ children }: { children: unknown }) => children,
}))

function sessao(perfil: 'GERENTE' | 'DONO' | 'ADMIN'): Normalization {
  return {
    session: { userId: `${perfil}-1`, perfil, lojaId: 'loja-1', idioma: 'pt' },
    authState: 'authenticated',
  }
}
const ANONIMO: Normalization = { session: null, authState: 'anonymous' }
const OPERADOR: Normalization = { session: null, authState: 'authenticated' }
const EXPIRADA: Normalization = { session: null, authState: 'stale' }

async function redirectDe(fn: () => unknown): Promise<string | null> {
  try {
    await fn()
    return null
  } catch (e) {
    const d = (e as { digest?: string }).digest ?? ''
    if (d.startsWith('NEXT_REDIRECT;')) return d.slice('NEXT_REDIRECT;'.length)
    throw e
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSignOut.mockResolvedValue({ error: null })
  mockReaderList.mockResolvedValue({ ok: true, contas: [], hasMore: false })
})

describe('P0 servidor — Server Action buscarContasPagarAction', () => {
  for (const [nome, norm] of [
    ['não autenticado', ANONIMO],
    ['sessão expirada', EXPIRADA],
    ['operador de caixa', OPERADOR],
  ] as const) {
    it(`${nome}: nega sem consultar o banco`, async () => {
      mockNormalization.mockResolvedValue(norm)
      const { buscarContasPagarAction } = await import('../app/gerente/financeiro/contas-pagar/actions')
      const r = await buscarContasPagarAction(1)
      expect(r.ok).toBe(false)
      expect(mockReaderList).not.toHaveBeenCalled()
    })
  }

  for (const perfil of ['GERENTE', 'DONO', 'ADMIN'] as const) {
    it(`${perfil}: permitido`, async () => {
      mockNormalization.mockResolvedValue(sessao(perfil))
      const { buscarContasPagarAction } = await import('../app/gerente/financeiro/contas-pagar/actions')
      const r = await buscarContasPagarAction(1)
      expect(r).toEqual({ ok: true, contas: [], hasMore: false })
      expect(mockReaderList).toHaveBeenCalledTimes(1)
    })
  }
})

describe('P0 servidor — página /caixa sem depender do middleware', () => {
  async function render() {
    const CaixaPage = (await import('../app/caixa/page')).default
    return redirectDe(() => CaixaPage())
  }

  it('não autenticado (sem erro do Auth): redireciona ao login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await render()).toBe('/login?next=%2Fcaixa')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('logout / sessão ausente: limpa sessão e redireciona', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Auth session missing!' } })
    expect(await render()).toBe('/login?reason=sessao_expirada')
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('sessão expirada (refresh token inválido): redireciona', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid Refresh Token' } })
    expect(await render()).toBe('/login?reason=sessao_expirada')
  })

  it('conta desativada: redireciona', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'op-1' } }, error: null })
    mockMaybeSingle.mockResolvedValue({ data: { perfil: 'OPERADOR', nome: 'Op', ativo: false, loja_id: 'loja-1' } })
    expect(await render()).toBe('/login?next=%2Fcaixa')
  })

  it('sem loja vinculada / sem cadastro: redireciona', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'op-1' } }, error: null })
    mockMaybeSingle.mockResolvedValue({ data: null })
    expect(await render()).toBe('/login?next=%2Fcaixa')
  })

  for (const perfil of ['OPERADOR', 'GERENTE', 'DONO', 'ADMIN']) {
    it(`${perfil} ativo com loja: renderiza o PDV`, async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'u@test.local' } }, error: null })
      mockMaybeSingle.mockResolvedValue({ data: { perfil, nome: 'Fulano', ativo: true, loja_id: 'loja-1' } })
      expect(await render()).toBeNull()
    })
  }
})

describe('P0 servidor — layouts /admin e /gerente sem depender do middleware', () => {
  const casos: [string, Normalization, { admin: string | null; gerente: string | null }][] = [
    ['não autenticado', ANONIMO, { admin: '/login?next=/admin', gerente: '/caixa' }],
    ['sessão expirada', EXPIRADA, { admin: '/login?next=/admin', gerente: '/caixa' }],
    ['operador de caixa', OPERADOR, { admin: '/login?next=/admin', gerente: '/caixa' }],
    ['gerente', sessao('GERENTE'), { admin: null, gerente: null }],
    ['dono', sessao('DONO'), { admin: null, gerente: null }],
    ['admin', sessao('ADMIN'), { admin: null, gerente: null }],
  ]
  for (const [nome, norm, esperado] of casos) {
    it(`${nome}: admin → ${esperado.admin ?? 'render'}, gerente → ${esperado.gerente ?? 'render'}`, async () => {
      mockNormalization.mockResolvedValue(norm)
      const AdminLayout = (await import('../app/admin/layout')).default
      const GerenteLayout = (await import('../app/gerente/layout')).default
      expect(await redirectDe(() => AdminLayout({ children: null }))).toBe(esperado.admin)
      expect(await redirectDe(() => GerenteLayout({ children: null }))).toBe(esperado.gerente)
    })
  }
})
