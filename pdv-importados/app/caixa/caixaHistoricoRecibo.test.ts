import { describe, expect, it } from 'vitest'
import { historicoDetalheParaRecibo } from '@/app/caixa/caixaHistoricoRecibo'
import type { HistoricoVendaDetalhe } from '@/app/caixa/actions'

const detalheBase: HistoricoVendaDetalhe = {
  id: 'venda-1',
  numeroVenda: '#A1B2C3D4',
  data: '2026-07-10T15:30:00.000Z',
  totalBruto: 100,
  totalDesconto: 0,
  totalLiquido: 100,
  formaPagamento: 'DINHEIRO',
  status: 'CONCLUIDA',
  clienteNome: null,
  itens: [
    {
      produtoId: 'p1',
      nome: 'Produto demo',
      quantidade: 2,
      precoUnitario: 50,
      total: 100,
    },
  ],
  pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 100 }],
}

describe('historicoDetalheParaRecibo', () => {
  it('mapeia detalhe para ReciboVenda sem token de gerente', () => {
    const recibo = historicoDetalheParaRecibo(detalheBase, 'R$')
    expect(recibo.vendaId).toBe('venda-1')
    expect(recibo.itens).toHaveLength(1)
    expect(recibo.itens[0]?.nome).toBe('Produto demo')
    expect(recibo.pagamentos[0]?.formaPagamento).toBe('DINHEIRO')
    expect(recibo.descontoGerentePercentual).toBe(0)
    expect(recibo.totalLiquidoComGerente).toBe(100)
  })

  it('normaliza forma de pagamento desconhecida para DINHEIRO', () => {
    const recibo = historicoDetalheParaRecibo(
      {
        ...detalheBase,
        pagamentos: [{ formaPagamento: 'OUTRO', valor: 50 }],
      },
      'R$',
    )
    expect(recibo.pagamentos[0]?.formaPagamento).toBe('DINHEIRO')
  })
})
