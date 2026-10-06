import { describe, expect, it } from 'vitest'
import { aplicarDescontoGerenteSobreTotal } from '@/stores/managerDiscount'
import { calcularTroco } from '@/app/caixa/caixaPagamentoSaldo'
import {
  finalizarVendaInputSchema,
  pagamentoSoDinheiro,
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

  it('totalsMatchDeclared rejeita diferença de R$ 0,01', () => {
    const computed = totaisFromItens([itemPrecificadoBase])
    expect(
      totalsMatchDeclared(computed, {
        totalBruto: 20,
        totalDesconto: 2,
        totalLiquido: 18.01,
      }),
    ).toBe(false)
  })

  it.each([
    { quantidade: 1, precoOriginal: 0.01, precoUnitario: 0.01, esperado: 0.01 },
    { quantidade: 1, precoOriginal: 0.1, precoUnitario: 0.1, esperado: 0.1 },
    { quantidade: 1, precoOriginal: 1.99, precoUnitario: 1.99, esperado: 1.99 },
    { quantidade: 3, precoOriginal: 1.99, precoUnitario: 1.99, esperado: 5.97 },
    { quantidade: 0.125, precoOriginal: 1.99, precoUnitario: 1.99, esperado: 0.25 },
  ])('totaliza centavos e quantidade $quantidade sem float residual', (item) => {
    expect(totaisFromItens([item]).totalLiquido).toBe(item.esperado)
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

  it('reconcilia split exatamente e rejeita excesso de R$ 0,01', () => {
    const base = {
      formaPagamento: 'DINHEIRO' as const,
      totalBruto: 20,
      totalDesconto: 2,
      totalLiquido: 18,
      itens: [itemBase],
    }
    expect(finalizarVendaInputSchema.safeParse({
      ...base,
      pagamentos: [
        { formaPagamento: 'DINHEIRO', valor: 7.99 },
        { formaPagamento: 'PIX', valor: 10.01 },
      ],
    }).success).toBe(true)
    expect(finalizarVendaInputSchema.safeParse({
      ...base,
      pagamentos: [
        { formaPagamento: 'DINHEIRO', valor: 8 },
        { formaPagamento: 'PIX', valor: 10.01 },
      ],
    }).success).toBe(false)
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

  describe('desconto de gerente em dinheiro', () => {
    const descontoBase = {
      totalBruto: 100,
      totalDesconto: 5,
      totalLiquido: 95,
      descontoGerenteToken: 'tok-gerente',
      descontoGerentePercentual: 5,
      itens: [itemBase],
    }

    it('5% sobre R$ 100 em dinheiro: total 95, valor 5 e troco 5 sobre R$ 100 recebidos', () => {
      const d = aplicarDescontoGerenteSobreTotal({ totalLiquido: 100, percentual: 5, maxPermitido: 20 })
      expect(d.descontoValor).toBe(5)
      expect(d.totalLiquidoComDesconto).toBe(95)
      expect(calcularTroco(d.totalLiquidoComDesconto, 100).troco).toBe(5)
    })

    it('10% sobre R$ 250 em dinheiro: total 225', () => {
      const d = aplicarDescontoGerenteSobreTotal({ totalLiquido: 250, percentual: 10, maxPermitido: 20 })
      expect(d.descontoValor).toBe(25)
      expect(d.totalLiquidoComDesconto).toBe(225)
    })

    it('0% não altera o total; percentual acima do teto é reduzido ao teto', () => {
      expect(aplicarDescontoGerenteSobreTotal({ totalLiquido: 100, percentual: 0, maxPermitido: 20 }).totalLiquidoComDesconto).toBe(100)
      expect(aplicarDescontoGerenteSobreTotal({ totalLiquido: 100, percentual: 50, maxPermitido: 20 }).totalLiquidoComDesconto).toBe(80)
    })

    it('aceita desconto com pagamento único em DINHEIRO', () => {
      const r = finalizarVendaInputSchema.safeParse({
        ...descontoBase,
        formaPagamento: 'DINHEIRO',
        pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 95 }],
      })
      expect(r.success).toBe(true)
    })

    it.each(['PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO'] as const)('rejeita desconto com %s', (forma) => {
      const r = finalizarVendaInputSchema.safeParse({
        ...descontoBase,
        formaPagamento: forma,
        pagamentos: [{ formaPagamento: forma, valor: 95 }],
      })
      expect(r.success).toBe(false)
    })

    it('rejeita desconto em venda dividida dinheiro + cartão', () => {
      const r = finalizarVendaInputSchema.safeParse({
        ...descontoBase,
        formaPagamento: 'DINHEIRO',
        pagamentos: [
          { formaPagamento: 'DINHEIRO', valor: 50 },
          { formaPagamento: 'CARTAO_DEBITO', valor: 45 },
        ],
      })
      expect(r.success).toBe(false)
    })

    it('rejeita percentual inválido (0, negativo, >100) ou token sem percentual', () => {
      const dinheiro = { formaPagamento: 'DINHEIRO' as const, pagamentos: [{ formaPagamento: 'DINHEIRO' as const, valor: 95 }] }
      for (const pct of [0, -5, 101]) {
        expect(finalizarVendaInputSchema.safeParse({ ...descontoBase, ...dinheiro, descontoGerentePercentual: pct }).success).toBe(false)
      }
      const { descontoGerentePercentual: _omit, ...semPct } = descontoBase
      expect(finalizarVendaInputSchema.safeParse({ ...semPct, ...dinheiro }).success).toBe(false)
    })

    it('regressão: venda sem desconto continua aceita em qualquer forma e em split', () => {
      const sem = { totalBruto: 20, totalDesconto: 2, totalLiquido: 18, itens: [itemBase] }
      for (const forma of ['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO'] as const) {
        expect(finalizarVendaInputSchema.safeParse({ ...sem, formaPagamento: forma, pagamentos: [{ formaPagamento: forma, valor: 18 }] }).success).toBe(true)
      }
    })

    it('pagamentoSoDinheiro', () => {
      expect(pagamentoSoDinheiro({ formaPagamento: 'DINHEIRO', pagamentos: [{ formaPagamento: 'DINHEIRO' }] })).toBe(true)
      expect(pagamentoSoDinheiro({ formaPagamento: 'DINHEIRO', pagamentos: [{ formaPagamento: 'DINHEIRO' }, { formaPagamento: 'PIX' }] })).toBe(false)
      expect(pagamentoSoDinheiro({ formaPagamento: 'PIX', pagamentos: [{ formaPagamento: 'PIX' }] })).toBe(false)
    })

    it('operador: aceita até 10% comercial sem token em 100% dinheiro', () => {
      const r = finalizarVendaInputSchema.safeParse({
        formaPagamento: 'DINHEIRO',
        totalBruto: 100,
        totalDesconto: 10,
        totalLiquido: 90,
        descontoGerentePercentual: 10,
        motivoDesconto: 'AUTORIZACAO_COMERCIAL',
        pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 90 }],
        itens: [itemBase],
      })
      expect(r.success).toBe(true)
    })

    it('operador: rejeita comercial sem token acima de 10% ou fora de dinheiro', () => {
      expect(finalizarVendaInputSchema.safeParse({
        formaPagamento: 'DINHEIRO',
        totalBruto: 100,
        totalDesconto: 15,
        totalLiquido: 85,
        descontoGerentePercentual: 15,
        motivoDesconto: 'AUTORIZACAO_COMERCIAL',
        pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 85 }],
        itens: [itemBase],
      }).success).toBe(false)

      expect(finalizarVendaInputSchema.safeParse({
        formaPagamento: 'PIX',
        totalBruto: 100,
        totalDesconto: 10,
        totalLiquido: 90,
        descontoGerentePercentual: 10,
        motivoDesconto: 'AUTORIZACAO_COMERCIAL',
        pagamentos: [{ formaPagamento: 'PIX', valor: 90 }],
        itens: [itemBase],
      }).success).toBe(false)
    })
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
})
