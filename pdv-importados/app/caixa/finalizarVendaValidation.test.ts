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
  precoOriginal: 10,
  precoUnitario: 10,
  tipoPreco: 'VAREJO' as const,
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

  it('finalizarVendaInputSchema aceita quantidade com 3 casas decimais', () => {
    const r = finalizarVendaInputSchema.safeParse({
      formaPagamento: 'DINHEIRO',
      totalBruto: 1.25,
      totalDesconto: 0,
      totalLiquido: 1.25,
      pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 1.25 }],
      itens: [{ ...itemBase, quantidade: 0.125 }],
    })
    expect(r.success).toBe(true)
  })

  it('finalizarVendaInputSchema rejeita quantidade com mais de 3 decimais', () => {
    const r = finalizarVendaInputSchema.safeParse({
      formaPagamento: 'DINHEIRO',
      totalBruto: 1,
      totalDesconto: 0,
      totalLiquido: 1,
      pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 1 }],
      itens: [{ ...itemBase, quantidade: 1.0001 }],
    })
    expect(r.success).toBe(false)
  })

  it('finalizarVendaInputSchema aceita idempotencyKey UUID opcional', () => {
    const r = finalizarVendaInputSchema.safeParse({
      idempotencyKey: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      formaPagamento: 'PIX',
      totalBruto: 20,
      totalDesconto: 2,
      totalLiquido: 18,
      pagamentos: [{ formaPagamento: 'PIX', valor: 18 }],
      itens: [itemBase],
    })
    expect(r.success).toBe(true)
  })

  it('finalizarVendaInputSchema rejeita idempotencyKey inválido', () => {
    const r = finalizarVendaInputSchema.safeParse({
      idempotencyKey: 'não-uuid',
      formaPagamento: 'PIX',
      totalBruto: 20,
      totalDesconto: 2,
      totalLiquido: 18,
      pagamentos: [{ formaPagamento: 'PIX', valor: 18 }],
      itens: [itemBase],
    })
    expect(r.success).toBe(false)
  })

  it('finalizarVendaInputSchema aceita clienteId UUID opcional', () => {
    const r = finalizarVendaInputSchema.safeParse({
      formaPagamento: 'DINHEIRO',
      totalBruto: 20,
      totalDesconto: 0,
      totalLiquido: 20,
      pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 5 }],
      clienteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      itens: [itemBase],
    })
    expect(r.success).toBe(true)
  })

  it('finalizarVendaInputSchema rejeita clienteId inválido', () => {
    const r = finalizarVendaInputSchema.safeParse({
      formaPagamento: 'DINHEIRO',
      totalBruto: 20,
      totalDesconto: 0,
      totalLiquido: 20,
      pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 5 }],
      clienteId: 'cliente-x',
      itens: [itemBase],
    })
    expect(r.success).toBe(false)
  })
})
