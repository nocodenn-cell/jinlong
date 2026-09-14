import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mapaContagemProdutos } from './contagemProdutosEmbutida'

describe('mapaContagemProdutos', () => {
  it('lê o formato de contagem embutida do PostgREST', () => {
    expect(
      mapaContagemProdutos([
        { id: 'a', produtos: [{ count: 3 }] },
        { id: 'b', produtos: [{ count: 0 }] },
      ]),
    ).toEqual({ a: 3, b: 0 })
  })

  it('formato inesperado ou erro vira mapa vazio (tela mostra 0, como antes em erro)', () => {
    expect(mapaContagemProdutos(null)).toEqual({})
    expect(mapaContagemProdutos([{ id: 'a' }])).toEqual({ a: 0 })
    expect(mapaContagemProdutos([{ nome: 'sem id', produtos: [{ count: 9 }] }])).toEqual({})
  })
})

/**
 * Regressão de performance: a listagem de categorias/marcas fazia um HEAD count em
 * `produtos` POR LINHA (N+1, medido ~4 s por request na rajada). Agora é uma única
 * leitura com contagem embutida — e nenhuma consulta direta em `produtos`.
 */
const assertGerenteSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/errors/mensagemErroUsuario', () => ({
  mensagemErroComSecao: (secao: string, msg: string) => `${secao}: ${msg}`,
  mensagemErroValidacaoZod: (msg: string) => msg,
}))
vi.mock('@/idioma/usuarioIdioma', () => ({ getUsuarioIdioma: async () => ({ idioma: 'pt' }) }))

function clienteListagem(tabela: string, linhas: Record<string, unknown>[], contagens: Record<string, number>) {
  const inIds = vi.fn(async (_col: string, ids: string[]) => ({
    data: ids.map((id) => ({ id, produtos: [{ count: contagens[id] ?? 0 }] })),
    error: null,
  }))
  const from = vi.fn((t: string) => {
    if (t !== tabela) throw new Error(`consulta inesperada em ${t}`)
    return {
      select: vi.fn((cols: string) =>
        cols.includes('produtos(count)')
          ? { in: inIds }
          : {
              order: vi.fn(() => ({
                range: vi.fn(async () => ({ data: linhas, error: null, count: linhas.length })),
              })),
            },
      ),
    }
  })
  return { client: { from }, from, inIds }
}

beforeEach(() => {
  vi.clearAllMocks()
  assertGerenteSession.mockResolvedValue({ ok: true })
})

describe('listagem com contagem de produtos — sem N+1', () => {
  it('categorias: uma leitura agregada, contagem por linha preservada', async () => {
    const { client, from, inIds } = clienteListagem(
      'categorias',
      [
        { id: 'c1', nome: 'A', ativo: true, categoria_pai_id: null, created_at: null },
        { id: 'c2', nome: 'B', ativo: true, categoria_pai_id: null, created_at: null },
      ],
      { c1: 4, c2: 0 },
    )
    createClient.mockResolvedValue(client)
    const { listarCategoriasProdutos } = await import('../categorias-produtos/actions')

    const r = await listarCategoriasProdutos({})

    expect(r.success).toBe(true)
    if (r.success) expect(r.data.rows.map((x) => [x.id, x.qtd_produtos])).toEqual([['c1', 4], ['c2', 0]])
    expect(inIds).toHaveBeenCalledTimes(1)
    expect(inIds).toHaveBeenCalledWith('id', ['c1', 'c2'])
    expect(from).not.toHaveBeenCalledWith('produtos')
  })

  it('marcas: uma leitura agregada, contagem por linha preservada', async () => {
    const { client, from, inIds } = clienteListagem(
      'marcas',
      [
        { id: 'm1', nome: 'X', ativo: true, created_at: null },
        { id: 'm2', nome: 'Y', ativo: false, created_at: null },
      ],
      { m1: 2, m2: 7 },
    )
    createClient.mockResolvedValue(client)
    const { listarMarcasProdutos } = await import('../marcas-produtos/actions')

    const r = await listarMarcasProdutos({})

    expect(r.success).toBe(true)
    if (r.success) expect(r.data.rows.map((x) => [x.id, x.qtd_produtos])).toEqual([['m1', 2], ['m2', 7]])
    expect(inIds).toHaveBeenCalledTimes(1)
    expect(from).not.toHaveBeenCalledWith('produtos')
  })
})
