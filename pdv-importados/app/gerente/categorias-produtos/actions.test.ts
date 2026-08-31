import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regressão A3 (Sprint UX Onda 1): as mutações de categoria revalidavam
 * `/gerente/categorias-produtos` — um redirect legado sem RSC próprio — em vez
 * da tela real `/admin/categorias-produtos`, então renomear/(in)ativar uma
 * categoria só refletia depois de F5 (Router Cache servindo o payload antigo).
 */

const assertGerenteSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient,
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/errors/mensagemErroUsuario', () => ({
  mensagemErroComSecao: (secao: string, msg: string) => `${secao}: ${msg}`,
  mensagemErroValidacaoZod: (msg: string) => msg,
}))
vi.mock('@/idioma/usuarioIdioma', () => ({
  getUsuarioIdioma: async () => ({ idioma: 'pt' }),
}))

const { revalidatePath, revalidateTag } = await import('next/cache')
const {
  criarCategoriaProduto,
  atualizarCategoriaProduto,
  alternarAtivoCategoriaProduto,
  excluirCategoriaProduto,
} = await import('./actions')

beforeEach(() => {
  vi.clearAllMocks()
  assertGerenteSession.mockResolvedValue({ ok: true })
})

function expectRealRoutesRevalidated() {
  expect(revalidatePath).toHaveBeenCalledWith('/admin/categorias-produtos')
  expect(revalidatePath).toHaveBeenCalledWith('/admin/catalogo')
  expect(revalidateTag).toHaveBeenCalledWith('catalogo-opcoes-filtro')
}

describe('categorias-produtos/actions — revalida a rota admin real (regressão A3)', () => {
  it('criarCategoriaProduto revalida /admin/categorias-produtos e /admin/catalogo', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'cat-1' }, error: null })
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    createClient.mockResolvedValue({ from: vi.fn(() => ({ insert })) })

    const r = await criarCategoriaProduto({ nome: 'Eletrônicos' })

    expect(r.success).toBe(true)
    expectRealRoutesRevalidated()
  })

  it('atualizarCategoriaProduto revalida /admin/categorias-produtos e /admin/catalogo', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    createClient.mockResolvedValue({ from: vi.fn(() => ({ update })) })

    const r = await atualizarCategoriaProduto({ id: '11111111-1111-1111-1111-111111111111', nome: 'Novo nome' })

    expect(r.success).toBe(true)
    expectRealRoutesRevalidated()
  })

  it('alternarAtivoCategoriaProduto revalida /admin/categorias-produtos e /admin/catalogo', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    createClient.mockResolvedValue({ from: vi.fn(() => ({ update })) })

    const r = await alternarAtivoCategoriaProduto('11111111-1111-1111-1111-111111111111', false)

    expect(r.success).toBe(true)
    expectRealRoutesRevalidated()
  })

  it('excluirCategoriaProduto (sem produtos vinculados) revalida /admin/categorias-produtos e /admin/catalogo', async () => {
    const countQuery = vi.fn().mockResolvedValue({ count: 0 })
    const eqCount = vi.fn(() => countQuery())
    const selectCount = vi.fn(() => ({ eq: eqCount }))

    const eqDelete = vi.fn().mockResolvedValue({ error: null })
    const del = vi.fn(() => ({ eq: eqDelete }))

    createClient.mockResolvedValue({
      from: vi.fn((table: string) => (table === 'produtos' ? { select: selectCount } : { delete: del })),
    })

    const r = await excluirCategoriaProduto('11111111-1111-1111-1111-111111111111')

    expect(r.success).toBe(true)
    expectRealRoutesRevalidated()
  })

  it('nunca depende apenas da rota legada /gerente/categorias-produtos para refletir a mudança', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    createClient.mockResolvedValue({ from: vi.fn(() => ({ update })) })

    await atualizarCategoriaProduto({ id: '11111111-1111-1111-1111-111111111111', nome: 'XY' })

    const calledPaths = (revalidatePath as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(
      (c) => c[0],
    )
    expect(calledPaths).toContain('/admin/categorias-produtos')
  })
})
