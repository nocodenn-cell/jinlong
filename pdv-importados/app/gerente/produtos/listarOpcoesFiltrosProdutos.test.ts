import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * T2 (auditoria 2026-09-27): `buscarOpcoesFiltrosCached` era `unstable_cache`
 * em cima de `createClient()` (que lê `cookies()`). Next.js 15 lança erro ao
 * acessar `cookies()` dentro do escopo de `unstable_cache`, e esse erro era
 * engolido — a função devolvia `categorias`/`marcas`/`fornecedores` vazios
 * com `success: true`, então os `<select>` do cadastro ficavam sem opções
 * sem nenhum aviso de erro.
 *
 * Este teste cobre a parte que dá pra isolar sem o runtime de rotas do
 * Next (não dá pra reproduzir em unit test o `cookies()` lançando dentro de
 * `unstable_cache` — isso está documentado no relatório da tarefa, verificado
 * lendo `node_modules/next/dist/server/request/cookies.js`): quando a query ao
 * banco falha, o erro precisa aparecer (`success: false`), nunca virar lista
 * vazia silenciosa.
 */

const assertGerenteSessionMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: fromMock }),
}))

// Isola o teste do runtime de cache do Next (sem workAsyncStorage fora de uma
// rota real, `unstable_cache` falha por conta própria) para exercitar só a
// lógica de swallow/propagação de erro da função em si.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

function selectOrderResolving(result: { data: unknown; error: unknown }) {
  return () => ({ order: () => Promise.resolve(result) })
}

describe('listarOpcoesFiltrosProdutos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({
      ok: true,
      session: { userId: 'mgr-1', lojaId: 'loja-1', idioma: 'pt' },
    })
  })

  it('erro na query de categorias vira falha visível, não lista vazia silenciosa', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'categorias') {
        return { select: selectOrderResolving({ data: null, error: { message: 'RLS negou leitura' } }) }
      }
      if (table === 'marcas') {
        return { select: selectOrderResolving({ data: [], error: null }) }
      }
      // fornecedores: select().eq().order()
      return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }
    })

    const { listarOpcoesFiltrosProdutos } = await import('./actions')
    const res = await listarOpcoesFiltrosProdutos()

    expect(res.success).toBe(false)
  })

  it('sucesso: devolve categorias, marcas e fornecedores da loja', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'categorias') {
        return {
          select: selectOrderResolving({
            data: [{ id: 'c1', nome: 'Bebidas', ativo: true }],
            error: null,
          }),
        }
      }
      if (table === 'marcas') {
        return {
          select: selectOrderResolving({ data: [{ id: 'm1', nome: 'Marca X', ativo: true }], error: null }),
        }
      }
      return {
        select: () => ({
          eq: (col: string, val: string) => {
            expect(col).toBe('loja_id')
            expect(val).toBe('loja-1')
            return { order: () => Promise.resolve({ data: [{ id: 'f1', nome: 'Fornecedor Y' }], error: null }) }
          },
        }),
      }
    })

    const { listarOpcoesFiltrosProdutos } = await import('./actions')
    const res = await listarOpcoesFiltrosProdutos()

    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.categorias).toEqual([{ id: 'c1', nome: 'Bebidas', ativo: true }])
      expect(res.data.marcas).toEqual([{ id: 'm1', nome: 'Marca X', ativo: true }])
      expect(res.data.fornecedores).toEqual([{ id: 'f1', nome: 'Fornecedor Y' }])
    }
  })
})
