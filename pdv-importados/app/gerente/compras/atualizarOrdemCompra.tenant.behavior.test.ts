import { beforeEach, describe, expect, it, vi } from 'vitest'

const assertGerenteSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())
const getGerenteUserId = vi.hoisted(() => vi.fn())
const getGerenteLojaId = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient,
}))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({
  getGerenteUserId,
  getGerenteLojaId,
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { atualizarOrdemCompra } from './actions'

/**
 * Cenário B da auditoria P1: `atualizarOrdemCompra` tem a mesma superfície
 * de `criarOrdemCompra` (Server Action chamável com payload arbitrário) e
 * precisa da mesma checagem de tenant em `produto_id`.
 */
describe('atualizarOrdemCompra — produto_id dos itens scoped à loja', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue({
      ok: true,
      session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' },
    })
  })

  function mockSupabase(opts: {
    produtosEncontrados: Array<{ id: string; loja_id: string }>
    updateOc?: ReturnType<typeof vi.fn>
    deleteItens?: ReturnType<typeof vi.fn>
    insertItens?: ReturnType<typeof vi.fn>
  }) {
    const updateOc =
      opts.updateOc ??
      vi.fn(() => ({
        eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      }))
    const deleteItens = opts.deleteItens ?? vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
    const insertItens = opts.insertItens ?? vi.fn().mockResolvedValue({ error: null })

    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'ordens_compra') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: { status: 'RASCUNHO' }, error: null }),
                })),
              })),
            })),
            update: updateOc,
          }
        }
        if (table === 'produtos') {
          return {
            select: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({ data: opts.produtosEncontrados, error: null }),
            })),
          }
        }
        if (table === 'ordens_compra_itens') {
          return { delete: deleteItens, insert: insertItens }
        }
        throw new Error(`tabela inesperada: ${table}`)
      }),
    })
    return { updateOc, deleteItens, insertItens }
  }

  it('rejeita produto_id de outra loja ao atualizar a OC (Cenário B)', async () => {
    const { updateOc, deleteItens, insertItens } = mockSupabase({
      produtosEncontrados: [{ id: 'produto-loja-b', loja_id: 'loja-b' }],
    })

    const r = await atualizarOrdemCompra({
      id: 'oc-1',
      itens: [{ produto_id: 'produto-loja-b', quantidade: 1, preco_unitario: 10, unidade_medida: 'UN' }],
    })

    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/inválido/i)
    expect(updateOc).not.toHaveBeenCalled()
    expect(deleteItens).not.toHaveBeenCalled()
    expect(insertItens).not.toHaveBeenCalled()
  })

  it('mantém apenas produtos da própria loja ao atualizar (Cenário C)', async () => {
    const { insertItens } = mockSupabase({
      produtosEncontrados: [{ id: 'produto-loja-a', loja_id: 'loja-a' }],
    })

    const r = await atualizarOrdemCompra({
      id: 'oc-1',
      itens: [{ produto_id: 'produto-loja-a', quantidade: 1, preco_unitario: 10, unidade_medida: 'UN' }],
    })

    expect(r.success).toBe(true)
    expect(insertItens).toHaveBeenCalled()
  })
})
