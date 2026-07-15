import { describe, expect, it } from 'vitest'
import { buildFinalizarVendaPayload } from './buildFinalizarVendaPayload'
import type { ItemCarrinhoComPreco } from '@/stores/carrinhoStore'

function item(overrides: Partial<ItemCarrinhoComPreco> = {}): ItemCarrinhoComPreco {
  return {
    id: 'item-1',
    produtoId: 'produto-1',
    quantidade: 1,
    nome: 'Produto teste',
    precoOriginal: 10,
    precoUnitario: 10,
    resultado: { precoOriginal: 10, precoUnitario: 10, descontoUnitario: 0, tipoPreco: 'VAREJO' },
    ...overrides,
  }
}

const baseInput = {
  itens: [item()],
  totalBruto: 10,
  totalDesconto: 0,
  totalLiquido: 10,
  descontoGerentePercentualEfetivo: 0,
  valorDescontoGerente: 0,
  totalLiquidoComGerente: 10,
  gerenteToken: null,
  pagamentos: [{ formaPagamento: 'DINHEIRO' as const, valor: 10 }],
  clienteId: null,
}

describe('buildFinalizarVendaPayload', () => {
  it('monta o payload no caso feliz (sem desconto de gerente, pagamento exato)', () => {
    const res = buildFinalizarVendaPayload(baseInput)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.payload).toMatchObject({
      formaPagamento: 'DINHEIRO',
      totalBruto: 10,
      totalDesconto: 0,
      totalLiquido: 10,
      descontoGerenteToken: undefined,
      descontoGerentePercentual: undefined,
      pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 10 }],
      clienteId: undefined,
    })
    expect(res.payload.itens).toEqual([
      { produtoId: 'produto-1', quantidade: 1, precoOriginal: 10, precoUnitario: 10, tipoPreco: 'VAREJO' },
    ])
  })

  it('bloqueia com violação quando o carrinho está vazio (snapshot fail-fast)', () => {
    const res = buildFinalizarVendaPayload({ ...baseInput, itens: [] })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.violations.some((v) => v.code === 'CART_EMPTY')).toBe(true)
  })

  it('aplica desconto de gerente no total e envia token/percentual', () => {
    const res = buildFinalizarVendaPayload({
      ...baseInput,
      descontoGerentePercentualEfetivo: 10,
      valorDescontoGerente: 1,
      totalLiquidoComGerente: 9,
      gerenteToken: 'token-gerente',
      pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 9 }],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.payload.totalDesconto).toBe(1)
    expect(res.payload.totalLiquido).toBe(9)
    expect(res.payload.descontoGerenteToken).toBe('token-gerente')
    expect(res.payload.descontoGerentePercentual).toBe(10)
  })

  it('desconta o troco (excesso pago) da parcela em DINHEIRO', () => {
    const res = buildFinalizarVendaPayload({
      ...baseInput,
      pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 15 }],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.payload.pagamentos).toEqual([{ formaPagamento: 'DINHEIRO', valor: 10 }])
  })

  it('propaga clienteId quando presente (pagamento parcial)', () => {
    const res = buildFinalizarVendaPayload({
      ...baseInput,
      totalLiquidoComGerente: 10,
      pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 4 }],
      clienteId: 'cliente-1',
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.payload.clienteId).toBe('cliente-1')
    expect(res.payload.pagamentos).toEqual([{ formaPagamento: 'DINHEIRO', valor: 4 }])
  })
})
