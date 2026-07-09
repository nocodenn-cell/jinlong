import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT')
  }),
}))

const getUserMock = vi.fn()
const fromMock = vi.fn()
const signOutMock = vi.fn()
const createClientMock = vi.fn()
const clearStaleMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/auth/staleSession', () => ({
  clearStaleSessionIfNeeded: clearStaleMock,
}))

/**
 * `getUsuarioAtual` é memoizado com `cache()` do React (dedup por requisição).
 * Em teste isso persiste por todo o processo, então re-importamos o módulo a cada
 * caso (`resetModules`) para obter um cache limpo.
 */
async function load() {
  vi.resetModules()
  const mod = await import('./usuarioIdioma')
  return { getUsuarioIdioma: mod.getUsuarioIdioma }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reposto aqui porque `mockReset: true` (vitest.config) limpa implementações entre testes.
  createClientMock.mockImplementation(async () => ({
    auth: { getUser: getUserMock, signOut: signOutMock },
    from: fromMock,
  }))
})

const baseUserRow = { perfil: 'GERENTE', idioma_preferido: 'pt', loja_id: null }

function setupUserExists() {
  const singleMock = vi.fn(async () => ({ data: baseUserRow }))
  const eqMock = vi.fn(() => ({ single: singleMock }))
  const selectMock = vi.fn(() => ({ eq: eqMock }))
  fromMock.mockReturnValue({ select: selectMock })
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
}

describe.sequential('getUsuarioIdioma', { timeout: 15_000 }, () => {
  // `vi.resetModules()` + dynamic import: instável em paralelo no Windows.
  it('retorna idioma e perfil normalizados quando o usuário existe', async () => {
    setupUserExists()
    const { getUsuarioIdioma } = await load()
    const r = await getUsuarioIdioma()
    expect(r).toEqual({ idioma: 'pt', perfil: 'GERENTE' })
  })

  it('retorna perfil anônimo quando a sessão está stale (sem redirect)', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'stale' } })
    clearStaleMock.mockResolvedValue(true)
    const { getUsuarioIdioma } = await load()
    const r = await getUsuarioIdioma()
    expect(r).toEqual({ idioma: 'pt', perfil: 'OPERADOR' })
  })

  it('lança erro de auth quando não é stale', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'outro' } })
    clearStaleMock.mockResolvedValue(false)
    const { getUsuarioIdioma } = await load()
    await expect(getUsuarioIdioma()).rejects.toThrow('outro')
  })
})
