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

import { criarOrdemCompra } from './actions'

const itemOk = {
  quantidade: 1,
  preco_unitario: 10,
  unidade_medida: 'UN',
  descricao: 'Item',
}

describe('criarOrdemCompra — fornecedor scoped à loja', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue({
      ok: true,
      session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' },
    })
    getGerenteUserId.mockResolvedValue('u1')
  })

  it('rejeita fornecedor de outra loja antes de inserir OC', async () => {
    const insertOc = vi.fn()
    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'fornecedores') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'f-b', loja_id: 'loja-b' },
                  error: null,
                }),
              })),
            })),
          }
        }
        return { insert: insertOc }
      }),
    })

    const r = await criarOrdemCompra({
      fornecedor_id: 'f-b',
      itens: [itemOk],
    })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/inválido/i)
    expect(insertOc).not.toHaveBeenCalled()
  })

  it('rejeita fornecedor_id inexistente', async () => {
    const insertOc = vi.fn()
    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'fornecedores') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
          }
        }
        return { insert: insertOc }
      }),
    })

    const r = await criarOrdemCompra({
      fornecedor_id: 'missing',
      itens: [itemOk],
    })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/inválido/i)
    expect(insertOc).not.toHaveBeenCalled()
  })

  it('aceita fornecedor da mesma loja', async () => {
    const insertItens = vi.fn().mockResolvedValue({ error: null })
    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'fornecedores') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'f-a', loja_id: 'loja-a' },
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'ordens_compra_itens') {
          return { insert: insertItens }
        }
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { id: 'oc-1' }, error: null }),
            })),
          })),
        }
      }),
    })

    const r = await criarOrdemCompra({
      fornecedor_id: 'f-a',
      itens: [itemOk],
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toBe('oc-1')
  })
})
