import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * listarOpcoesFiltrosProdutos — categorias/fornecedores/marcas do cadastro
 * de produto (rápido e completo) e dos filtros do catálogo.
 *
 * Regressão: a função cacheava a busca com `unstable_cache`, mas o corpo
 * cacheado chamava `createClient()` (que lê `cookies()`) — o Next.js lança
 * em runtime quando uma dynamic API roda dentro de `unstable_cache`. O erro
 * era engolido pelo try/catch em `listarOpcoesFiltrosProdutos` e virava
 * `{ success: false }`, que as páginas do catálogo (admin/catalogo, novo/
 * completo, [id]/completo) tratavam como fallback silencioso para arrays
 * vazios — os selects de Categoria/Fornecedor/Marca ficavam vazios mesmo
 * havendo registros no banco. Este teste garante que a função nunca mais
 * passe por `unstable_cache`.
 */

const assertGerenteSessionMock = vi.fn()
const categoriasOrderMock = vi.fn()
const marcasOrderMock = vi.fn()
const fornecedoresOrderMock = vi.fn()
const unstableCacheMock = vi.fn(() => {
  throw new Error('unstable_cache não deve envolver uma função que usa cookies() (createClient)')
})

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))

vi.mock('next/cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/cache')>()
  return { ...actual, unstable_cache: unstableCacheMock }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === 'categorias') {
        return { select: () => ({ order: categoriasOrderMock }) }
      }
      if (table === 'marcas') {
        return { select: () => ({ order: marcasOrderMock }) }
      }
      if (table === 'fornecedores') {
        return { select: () => ({ eq: () => ({ order: fornecedoresOrderMock }) }) }
      }
      throw new Error(`tabela inesperada: ${table}`)
    },
  }),
}))

const LOJA_ID = 'loja-1'

beforeEach(() => {
  vi.clearAllMocks()
  assertGerenteSessionMock.mockResolvedValue({ ok: true, session: { lojaId: LOJA_ID } })
  categoriasOrderMock.mockResolvedValue({
    data: [{ id: 'cat-1', nome: 'Bebidas', ativo: true }],
    error: null,
  })
  marcasOrderMock.mockResolvedValue({
    data: [{ id: 'mar-1', nome: 'Marca X', ativo: true }],
    error: null,
  })
  fornecedoresOrderMock.mockResolvedValue({
    data: [{ id: 'forn-1', nome: 'Fornecedor Y' }],
    error: null,
  })
})

describe('listarOpcoesFiltrosProdutos', () => {
  it('retorna categorias, marcas e fornecedores sem passar por unstable_cache', async () => {
    const { listarOpcoesFiltrosProdutos } = await import('./actions')

    const res = await listarOpcoesFiltrosProdutos()

    expect(res.success).toBe(true)
    if (!res.success) throw new Error('esperava success:true')
    expect(res.data.categorias).toEqual([{ id: 'cat-1', nome: 'Bebidas', ativo: true }])
    expect(res.data.marcas).toEqual([{ id: 'mar-1', nome: 'Marca X', ativo: true }])
    expect(res.data.fornecedores).toEqual([{ id: 'forn-1', nome: 'Fornecedor Y' }])
    expect(unstableCacheMock).not.toHaveBeenCalled()
  })

  it('fornecedores é filtrado pela loja da sessão', async () => {
    const { listarOpcoesFiltrosProdutos } = await import('./actions')

    await listarOpcoesFiltrosProdutos()

    expect(fornecedoresOrderMock).toHaveBeenCalled()
  })

  it('sem loja associada à sessão, falha antes de consultar o banco', async () => {
    assertGerenteSessionMock.mockResolvedValue({ ok: true, session: { lojaId: null } })
    const { listarOpcoesFiltrosProdutos } = await import('./actions')

    const res = await listarOpcoesFiltrosProdutos()

    expect(res.success).toBe(false)
    expect(categoriasOrderMock).not.toHaveBeenCalled()
  })
})
