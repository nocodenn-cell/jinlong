import { describe, expect, it } from 'vitest'
import { AtualizarEstoqueSchema, ProdutoIdSchema } from './actions.validation'

describe('actions.validation estoque', () => {
  it('AtualizarEstoqueSchema aceita payload válido', () => {
    const r = AtualizarEstoqueSchema.safeParse({
      produto_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      quantidade_atual: 10,
      estoque_minimo: 2,
      motivo: 'ACERTO_INVENTARIO',
      observacao: 'contagem cega',
    })
    expect(r.success).toBe(true)
  })

  it('AtualizarEstoqueSchema exige observação quando motivo for OUTRO', () => {
    const r = AtualizarEstoqueSchema.safeParse({
      produto_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      quantidade_atual: 10,
      estoque_minimo: 2,
      motivo: 'OUTRO',
      observacao: '',
    })
    expect(r.success).toBe(false)
  })

  it('preserva zero como contagem física válida e rejeita negativo', () => {
    const base = {
      produto_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      estoque_minimo: 0,
      motivo: 'ACERTO_INVENTARIO' as const,
      observacao: 'nenhum item encontrado',
    }
    expect(AtualizarEstoqueSchema.safeParse({ ...base, quantidade_atual: 0 }).success).toBe(true)
    expect(AtualizarEstoqueSchema.safeParse({ ...base, quantidade_atual: -1 }).success).toBe(false)
  })

  it('ProdutoIdSchema rejeita uuid inválido', () => {
    const r = ProdutoIdSchema.safeParse({ produto_id: 'x' })
    expect(r.success).toBe(false)
  })
})
