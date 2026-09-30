import { describe, expect, it } from 'vitest'
import { descontoProdutosLiquido } from '@/lib/caixa/reciboTotais'
import {
  historicoDetalheParaRecibo,
} from '@/app/caixa/caixaHistoricoRecibo'
import type { HistoricoVendaDetalhe } from '@/app/caixa/actions'

function detalhe(over: Partial<HistoricoVendaDetalhe> = {}): HistoricoVendaDetalhe {
  return {
    id: 'venda-1',
    numeroVenda: '#A1B2C3D4',
    data: '2026-07-10T15:30:00.000Z',
    totalBruto: 100,
    totalDesconto: 0,
    totalLiquido: 100,
    formaPagamento: 'DINHEIRO',
    status: 'CONCLUIDA',
    clienteNome: null,
    descontoGerentePercentual: 0,
    valorDescontoGerente: 0,
    itens: [
      {
        produtoId: 'p1',
        nome: 'Produto demo',
        quantidade: 2,
        precoUnitario: 50,
        precoOriginal: 50,
        tipoPreco: 'VAREJO',
        total: 100,
      },
    ],
    pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 100 }],
    ...over,
  }
}

describe('historicoDetalheParaRecibo — ID 28 reimpressão fiel', () => {
  it('1. varejo sem desconto → totais e tipoPreco corretos', () => {
    const recibo = historicoDetalheParaRecibo(detalhe(), 'R$')
    expect(recibo.itens[0]?.tipoPreco).toBe('VAREJO')
    expect(recibo.itens[0]?.precoOriginal).toBe(50)
    expect(recibo.descontoGerentePercentual).toBe(0)
    expect(recibo.valorDescontoGerente).toBe(0)
    expect(recibo.totalBruto).toBe(100)
    expect(recibo.totalDesconto).toBe(0)
    expect(recibo.totalLiquidoComGerente).toBe(100)
  })

  it('2. atacado → badge/tipoPreco ATACADO no item', () => {
    const recibo = historicoDetalheParaRecibo(
      detalhe({
        itens: [
          {
            produtoId: 'p-at',
            nome: 'Caixa atacado',
            quantidade: 12,
            precoUnitario: 8,
            precoOriginal: 10,
            tipoPreco: 'ATACADO',
            total: 96,
          },
        ],
        totalBruto: 120,
        totalDesconto: 24,
        totalLiquido: 96,
      }),
      'R$',
    )
    expect(recibo.itens[0]?.tipoPreco).toBe('ATACADO')
    expect(recibo.itens[0]?.precoOriginal).toBe(10)
    expect(recibo.totalLiquidoComGerente).toBe(96)
  })

  it('3. desconto gerente → percentual e valor separados do desconto de itens', () => {
    const d = detalhe({
      totalBruto: 200,
      totalDesconto: 30,
      totalLiquido: 170,
      descontoGerentePercentual: 10,
      valorDescontoGerente: 20,
    })
    const recibo = historicoDetalheParaRecibo(d, 'R$')
    expect(recibo.descontoGerentePercentual).toBe(10)
    expect(recibo.valorDescontoGerente).toBe(20)
    // totalDesconto inclui o do gerente; o cupom separa itens = 30 − 20 = 10
    expect(recibo.totalDesconto).toBe(30)
    expect(descontoProdutosLiquido(recibo)).toBe(10)
    expect(recibo.totalBruto - descontoProdutosLiquido(recibo) - recibo.valorDescontoGerente).toBe(170)
    expect(recibo.totalLiquidoComGerente).toBe(170)
  })

  it('4. pagamentos múltiplos preservados', () => {
    const recibo = historicoDetalheParaRecibo(
      detalhe({
        pagamentos: [
          { formaPagamento: 'PIX', valor: 60 },
          { formaPagamento: 'DINHEIRO', valor: 40 },
        ],
        totalLiquido: 100,
      }),
      'R$',
    )
    expect(recibo.pagamentos).toHaveLength(2)
    expect(recibo.pagamentos[0]?.formaPagamento).toBe('PIX')
    expect(recibo.pagamentos[1]?.valor).toBe(40)
  })

  it('5. totais batem com detalhe autoritativo', () => {
    const recibo = historicoDetalheParaRecibo(
      detalhe({
        totalBruto: 500,
        totalDesconto: 50,
        totalLiquido: 450,
        descontoGerentePercentual: 5,
        valorDescontoGerente: 25,
      }),
      'R$',
    )
    expect(recibo.totalBruto).toBe(500)
    expect(recibo.totalDesconto).toBe(50)
    expect(descontoProdutosLiquido(recibo)).toBe(25)
    expect(recibo.totalLiquidoComGerente).toBe(450)
  })

  it('6. legado sem metadado → defaults seguros (VAREJO, sem gerente)', () => {
    const recibo = historicoDetalheParaRecibo(
      detalhe({
        itens: [
          {
            produtoId: 'p-leg',
            nome: 'Legado',
            quantidade: 1,
            precoUnitario: 30,
            precoOriginal: 30,
            tipoPreco: 'VAREJO',
            total: 30,
          },
        ],
        descontoGerentePercentual: 0,
        valorDescontoGerente: 0,
      }),
      'R$',
    )
    expect(recibo.itens[0]?.tipoPreco).toBe('VAREJO')
    expect(recibo.descontoGerentePercentual).toBe(0)
  })

  it('normaliza forma de pagamento desconhecida para DINHEIRO', () => {
    const recibo = historicoDetalheParaRecibo(
      detalhe({ pagamentos: [{ formaPagamento: 'OUTRO', valor: 50 }] }),
      'R$',
    )
    expect(recibo.pagamentos[0]?.formaPagamento).toBe('DINHEIRO')
  })

  it('RM-08: repassa o cliente vinculado à venda para o recibo reimpresso', () => {
    const recibo = historicoDetalheParaRecibo(detalhe({ clienteNome: 'Mercado São Jorge' }), 'R$')
    expect(recibo.clienteNome).toBe('Mercado São Jorge')
  })

  it('RM-08: venda anônima reimpressa não inventa cliente', () => {
    const recibo = historicoDetalheParaRecibo(detalhe({ clienteNome: null }), 'R$')
    expect(recibo.clienteNome).toBeNull()
  })
})

describe('F12 — caminho direto não usa historicoDetalheParaRecibo', () => {
  it('7. contrato: F12 monta ReciboVenda inline em CaixaPageClient (sem regressão neste mapper)', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'app/caixa/CaixaPageClient.tsx'),
      'utf8',
    )
    expect(src).toContain('lastReciboRef.current = {')
    expect(src).toMatch(/tipoPreco:\s*i\.resultado\?\.tipoPreco/)
    expect(src).toContain('descontoGerentePercentual: descontoGerentePercentualEfetivo')
    expect(src).toContain('historicoDetalheParaRecibo')
  })
})
