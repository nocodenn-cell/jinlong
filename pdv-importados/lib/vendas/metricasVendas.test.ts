import { describe, expect, it } from 'vitest'
import {
  calcularMetricasVendas,
  formatarPercentual,
  metricasDeRpc,
  receitaLiquida,
  taxaCancelamento,
  ticketMedio,
  type VendaMetricaMin,
} from './metricasVendas'

/** Cenário de aceite da Onda A (o mesmo do harness SQL vendas-lista-kpis-por-venda.test.sql). */
const CENARIO: VendaMetricaMin[] = [
  { status: 'CONCLUIDA', total_liquido: 100.0, venda_pos_venda_operacoes: [] },
  {
    status: 'CONCLUIDA',
    total_liquido: 123.9,
    venda_pos_venda_operacoes: [{ valor_estornado: 50 }], // devolução pós-venda efetiva (valor econômico total)
  },
  { status: 'CONCLUIDA', total_liquido: 130.0, venda_pos_venda_operacoes: [] },
  {
    status: 'CANCELADA',
    total_liquido: 129.9,
    // cancelamento não gera operação pós-venda; a devolução anterior ao cancelamento está fora (venda CANCELADA)
    venda_pos_venda_operacoes: [{ valor_estornado: 10 }],
  },
]

describe('metricasVendas — contrato canônico', () => {
  it('cenário: 4 vendas, 3 concluídas = 353,90, 1 cancelada = 129,90', () => {
    const m = calcularMetricasVendas(CENARIO)
    expect(m.vendasRegistradas).toBe(4)
    expect(m.vendasConcluidas).toBe(3)
    expect(m.faturado).toBe(353.9)
    expect(m.vendasCanceladas).toBe(1)
    expect(m.valorCancelado).toBe(129.9)
  })

  it('ticket médio = faturado / concluídas (117,966...) e apresenta 117,97', () => {
    const m = calcularMetricasVendas(CENARIO)
    expect(m.ticketMedio).toBeCloseTo(353.9 / 3, 10)
    expect(m.ticketMedio.toFixed(2)).toBe('117.97')
  })

  it('taxa de cancelamento é fração 0,25 e vira 25,0% só na apresentação', () => {
    const m = calcularMetricasVendas(CENARIO)
    expect(m.taxaCancelamento).toBe(0.25)
    expect(formatarPercentual(m.taxaCancelamento)).toBe('25,0%')
  })

  it('devolução: só pós-venda efetiva de venda CONCLUIDA; linha de cancelamento e venda cancelada ficam fora', () => {
    const m = calcularMetricasVendas(CENARIO)
    expect(m.devolucoes).toBe(50)
    expect(m.receitaLiquida).toBe(303.9)
  })

  it('venda cancelada não entra em faturado nem em receita líquida', () => {
    const so = calcularMetricasVendas([{ status: 'CANCELADA', total_liquido: 129.9 }])
    expect(so.faturado).toBe(0)
    expect(so.receitaLiquida).toBe(0)
    expect(so.vendasConcluidas).toBe(0)
  })

  it('denominador zero: tudo zero, sem NaN', () => {
    const m = calcularMetricasVendas([])
    expect(m).toEqual({
      vendasRegistradas: 0,
      vendasConcluidas: 0,
      faturado: 0,
      vendasCanceladas: 0,
      valorCancelado: 0,
      devolucoes: 0,
      receitaLiquida: 0,
      ticketMedio: 0,
      taxaCancelamento: 0,
    })
    expect(ticketMedio(0, 0)).toBe(0)
    expect(taxaCancelamento(0, 0)).toBe(0)
    expect(formatarPercentual(taxaCancelamento(0, 0))).toBe('0,0%')
  })

  it('devolução MISTA (D-13): venda 100, devolução 30 = 10 em meio + 20 abatidos de AR → devolução 30 e receita líquida 70', () => {
    // `devolucoes.valor` guardaria só os 10; o valor econômico é `venda_pos_venda_operacoes.valor_estornado` = 30.
    const m = calcularMetricasVendas([
      { status: 'CONCLUIDA', total_liquido: 100, venda_pos_venda_operacoes: [{ valor_estornado: 30 }] },
    ])
    expect(m.devolucoes).toBe(30)
    expect(m.receitaLiquida).toBe(70)
    expect(m.ticketMedio).toBe(100) // ticket não deduz devolução
  })

  it('totais como string do PostgREST são tratados como número', () => {
    const m = calcularMetricasVendas([
      { status: 'CONCLUIDA', total_liquido: '10.50', venda_pos_venda_operacoes: [{ valor_estornado: '2.50' }] },
    ])
    expect(m.faturado).toBe(10.5)
    expect(m.devolucoes).toBe(2.5)
    expect(m.receitaLiquida).toBe(8)
  })

  it('receitaLiquida não fica com resíduo de ponto flutuante', () => {
    expect(receitaLiquida(0.3, 0.1)).toBe(0.2)
  })

  it('formatarPercentual usa vírgula pt-BR e uma casa decimal', () => {
    expect(formatarPercentual(0.1)).toBe('10,0%')
    expect(formatarPercentual(1 / 3)).toBe('33,3%')
    expect(formatarPercentual(Number.NaN)).toBe('0,0%')
  })

  it('metricasDeRpc converte a linha do banco (numerics como string) e tolera ausência', () => {
    const m = metricasDeRpc({
      vendas_registradas: '4',
      vendas_concluidas: 3,
      faturado: '353.90',
      vendas_canceladas: '1',
      valor_cancelado: '129.90',
      devolucoes: '50.00',
      receita_liquida: '303.90',
      ticket_medio: '117.9666666666666667',
      taxa_cancelamento: '0.2500',
    })
    expect(m.faturado).toBe(353.9)
    expect(m.receitaLiquida).toBe(303.9)
    expect(m.taxaCancelamento).toBe(0.25)
    expect(metricasDeRpc(null).faturado).toBe(0)
  })
})
