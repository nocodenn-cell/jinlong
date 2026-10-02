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

describe('criarOrdemCompra — produto_id dos itens scoped à loja', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue({
      ok: true,
      session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' },
    })
    getGerenteUserId.mockResolvedValue('u1')
  })

  function mockSupabase(opts: {
    produtosEncontrados: Array<{ id: string; loja_id: string }>
    insertOc?: ReturnType<typeof vi.fn>
    insertItens?: ReturnType<typeof vi.fn>
  }) {
    const insertOc =
      opts.insertOc ??
      vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'oc-1' }, error: null }),
        })),
      }))
    const insertItens = opts.insertItens ?? vi.fn().mockResolvedValue({ error: null })

    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'produtos') {
          return {
            // ProductReader.getIdentityById: select(...).eq('id', id).maybeSingle()
            select: vi.fn(() => ({
              eq: vi.fn((_col: string, id: string) => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: (() => {
                    const p = opts.produtosEncontrados.find((x) => x.id === id)
                    return p
                      ? { id: p.id, loja_id: p.loja_id, nome: 'P', codigo_barras: null, codigo_interno: null, ativo: true, status_publicacao: 'PUBLICADO' }
                      : null
                  })(),
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'ordens_compra_itens') {
          return { insert: insertItens }
        }
        return { insert: insertOc }
      }),
    })
    return { insertOc, insertItens }
  }

  it('rejeita produto_id de outra loja antes de criar a OC (Cenário A)', async () => {
    const { insertOc, insertItens } = mockSupabase({
      produtosEncontrados: [{ id: 'produto-loja-b', loja_id: 'loja-b' }],
    })

    const r = await criarOrdemCompra({
      itens: [{ produto_id: 'produto-loja-b', quantidade: 1, preco_unitario: 10, unidade_medida: 'UN' }],
    })

    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/inválido/i)
    expect(insertOc).not.toHaveBeenCalled()
    expect(insertItens).not.toHaveBeenCalled()
  })

  it('rejeita produto_id inexistente', async () => {
    const { insertOc } = mockSupabase({ produtosEncontrados: [] })

    const r = await criarOrdemCompra({
      itens: [{ produto_id: 'produto-fantasma', quantidade: 1, preco_unitario: 10, unidade_medida: 'UN' }],
    })

    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/inválido/i)
    expect(insertOc).not.toHaveBeenCalled()
  })

  it('rejeita payload misto: um produto próprio + um de outra loja', async () => {
    const { insertOc } = mockSupabase({
      produtosEncontrados: [
        { id: 'produto-loja-a', loja_id: 'loja-a' },
        { id: 'produto-loja-b', loja_id: 'loja-b' },
      ],
    })

    const r = await criarOrdemCompra({
      itens: [
        { produto_id: 'produto-loja-a', quantidade: 1, preco_unitario: 10, unidade_medida: 'UN' },
        { produto_id: 'produto-loja-b', quantidade: 1, preco_unitario: 10, unidade_medida: 'UN' },
      ],
    })

    expect(r.success).toBe(false)
    expect(insertOc).not.toHaveBeenCalled()
  })

  it('aceita produto_id da própria loja (Cenário C)', async () => {
    const { insertItens } = mockSupabase({
      produtosEncontrados: [{ id: 'produto-loja-a', loja_id: 'loja-a' }],
    })

    const r = await criarOrdemCompra({
      itens: [{ produto_id: 'produto-loja-a', quantidade: 1, preco_unitario: 10, unidade_medida: 'UN' }],
    })

    expect(r.success).toBe(true)
    expect(insertItens).toHaveBeenCalled()
  })

  it('itens sem produto_id (descrição livre) não disparam consulta a produtos', async () => {
    const produtosQuery = vi.fn()
    const insertItens = vi.fn().mockResolvedValue({ error: null })
    createClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'produtos') {
          produtosQuery()
          return { select: vi.fn(() => ({ eq: vi.fn() })) }
        }
        if (table === 'ordens_compra_itens') return { insert: insertItens }
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { id: 'oc-1' }, error: null }),
            })),
          })),
        }
      }),
    })

    const r = await criarOrdemCompra({ itens: [itemOk] })

    expect(r.success).toBe(true)
    expect(produtosQuery).not.toHaveBeenCalled()
  })
})
