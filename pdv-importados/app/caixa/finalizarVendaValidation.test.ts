import { describe, expect, it } from 'vitest'
import {
  finalizarVendaInputSchema,
  roundMoney2,
  totaisFromItens,
  totalsMatchDeclared,
} from './finalizarVendaValidation'

const itemBase = {
  produtoId: '550e8400-e29b-41d4-a716-446655440000',
  quantidade: 2,
}

const itemPrecificadoBase = {
  precoOriginal: 10,
  precoUnitario: 9,
  quantidade: 2,
}

describe('finalizarVendaValidation', () => {
  it('roundMoney2 arredonda para 2 casas', () => {
    expect(roundMoney2(10.126)).toBe(10.13)
    expect(roundMoney2(10.124)).toBe(10.12)
  })

  it('totaisFromItens soma itens', () => {
    const t = totaisFromItens([itemPrecificadoBase])
    expect(t.totalBruto).toBe(20)
    expect(t.totalLiquido).toBe(18)
    expect(t.totalDesconto).toBe(2)
  })

  it('totalsMatchDeclared aceita totais declarados coerentes', () => {
    const itens = [itemPrecificadoBase]
    const computed = totaisFromItens(itens)
    expect(
      totalsMatchDeclared(computed, {
        totalBruto: 20,
        totalDesconto: 2,
        totalLiquido: 18,
      }),
    ).toBe(true)
  })

  it('totalsMatchDeclared rejeita divergência', () => {
    const itens = [itemPrecificadoBase]
    const computed = totaisFromItens(itens)
    expect(
      totalsMatchDeclared(computed, {
        totalBruto: 999,
        totalDesconto: 2,
        totalLiquido: 18,
      }),
    ).toBe(false)
  })

  it('finalizarVendaInputSchema exige ao menos um item', () => {
    const r = finalizarVendaInputSchema.safeParse({
      formaPagamento: 'DINHEIRO',
      totalBruto: 1,
      totalDesconto: 0,
      totalLiquido: 1,
      pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 1 }],
      itens: [],
    })
    expect(r.success).toBe(false)
  })

  it('finalizarVendaInputSchema aceita payload mínimo válido', () => {
    const r = finalizarVendaInputSchema.safeParse({
      formaPagamento: 'PIX',
      totalBruto: 20,
      totalDesconto: 2,
      totalLiquido: 18,
      pagamentos: [{ formaPagamento: 'PIX', valor: 18 }],
      itens: [itemBase],
    })
    expect(r.success).toBe(true)
  })
})
