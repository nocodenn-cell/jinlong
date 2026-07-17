import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { NovoProdutoInput } from '@/core/ports/produto'
import { createProdutoRepository } from './produtoRepository'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const LOJA_ID = '22222222-2222-4222-8222-222222222222'
const PRODUTO_ID = '33333333-3333-4333-8333-333333333333'

const produtoInput: NovoProdutoInput = {
  nome: 'Produto teste',
  codigo_barras: null,
  preco_varejo: 10,
  origem: 'china_manual',
  tem_nf: false,
}

interface FakeClientOptions {
  rollbackError?: { message: string } | null
}

function buildClient(options: FakeClientOptions = {}) {
  const deleteEq = vi.fn().mockResolvedValue({
    error: options.rollbackError ?? null,
  })
  const deleteProduto = vi.fn(() => ({ eq: deleteEq }))
  const insertProduto = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: { id: PRODUTO_ID },
        error: null,
      }),
    })),
  }))
  const insertEstoque = vi.fn().mockResolvedValue({
    error: { message: 'estoque indisponível' },
  })
  const selectUsuario = vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { loja_id: LOJA_ID },
        error: null,
      }),
    })),
  }))
  const from = vi.fn((table: string) => {
    if (table === 'usuarios') return { select: selectUsuario }
    if (table === 'estoque') return { insert: insertEstoque }
    return { insert: insertProduto, delete: deleteProduto }
  })
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      }),
    },
    from,
  } as unknown as SupabaseClient

  return { client, deleteProduto, deleteEq }
}

describe('createProdutoRepository', () => {
  it('remove o produto se a criação do estoque falhar', async () => {
    const { client, deleteProduto, deleteEq } = buildClient()
    const repo = createProdutoRepository(client)

    const result = await repo.createWithDefaultEstoque(produtoInput)

    expect(result.ok).toBe(false)
    expect(deleteProduto).toHaveBeenCalledOnce()
    expect(deleteEq).toHaveBeenCalledWith('id', PRODUTO_ID)
  })

  it('informa quando não consegue remover o produto parcial', async () => {
    const { client } = buildClient({
      rollbackError: { message: 'permission denied' },
    })
    const repo = createProdutoRepository(client)

    const result = await repo.createWithDefaultEstoque(produtoInput)

    expect(result).toMatchObject({ ok: false })
    if (!result.ok) {
      expect(result.message).toContain('Rollback do produto')
    }
  })
})
