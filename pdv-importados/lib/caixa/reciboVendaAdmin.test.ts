import { describe, expect, it } from 'vitest'
import type { VendaDetalhe } from '@/app/admin/vendas/actions'
import { vendaAdminParaRecibo } from './reciboVendaAdmin'
import { descontoProdutosLiquido } from './reciboTotais'

const item = {
  id: 'i1',
  nome: 'Produto',
  codigo_barras: null,
  quantidade: 2,
  quantidade_devolvida: 0,
  preco_unitario: 100,
  preco_unitario_original: 105,
  desconto_unitario: 5,
  subtotal: 200,
  tipo_preco: 'ATACADO',
  tipo_preco_fonte: null,
  custo_unitario_snap: null,
  regra_aplicada_id: null,
}

const base: VendaDetalhe = {
  id: 'abcdef12-3456',
  data: '2026-08-27T12:00:00Z',
  total_bruto: 200,
  total_desconto: 30,
  total_liquido: 170,
  forma_pagamento: 'DINHEIRO',
  tipo_venda: null,
  status: 'CONCLUIDA',
  numero_nf: null,
  operador_nome: 'Ana',
  cliente_nome: 'Maria',
  tem_conta_receber: false,
  valor_aberto_cr: 0,
  pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: 170 }],
  desconto_gerente_valor: 20,
  desconto_gerente_percentual: 10,
  itens: [item],
  showMargemVisual: false,
  showPrecoFonte: false,
}

describe('vendaAdminParaRecibo', () => {
  it('mapeia itens, cliente e totais; o desconto de itens separa o do gerente', () => {
    const r = vendaAdminParaRecibo(base, 'R$')
    expect(r.clienteNome).toBe('Maria')
    expect(r.itens[0]).toMatchObject({
      nome: 'Produto',
      quantidade: 2,
      precoUnitario: 100,
      precoOriginal: 105,
      tipoPreco: 'ATACADO',
    })
    expect(descontoProdutosLiquido(r)).toBe(10)
    expect(r.totalBruto - descontoProdutosLiquido(r) - r.valorDescontoGerente).toBe(
      r.totalLiquidoComGerente,
    )
  })

  it('split de pagamentos preservado', () => {
    const r = vendaAdminParaRecibo(
      {
        ...base,
        pagamentos: [
          { forma_pagamento: 'PIX', valor: 100 },
          { forma_pagamento: 'DINHEIRO', valor: 70 },
        ],
      },
      'R$',
    )
    expect(r.pagamentos).toEqual([
      { formaPagamento: 'PIX', valor: 100 },
      { formaPagamento: 'DINHEIRO', valor: 70 },
    ])
  })

  it('venda legada sem vendas_pagamentos: usa forma_pagamento com o total líquido', () => {
    const r = vendaAdminParaRecibo({ ...base, pagamentos: [], forma_pagamento: 'PIX' }, 'R$')
    expect(r.pagamentos).toEqual([{ formaPagamento: 'PIX', valor: 170 }])
  })

  it('sem desconto de gerente e sem tipo de preço: defaults seguros', () => {
    const r = vendaAdminParaRecibo(
      {
        ...base,
        desconto_gerente_valor: 0,
        desconto_gerente_percentual: 0,
        total_desconto: 0,
        itens: [{ ...item, tipo_preco: null }],
      },
      'R$',
    )
    expect(r.valorDescontoGerente).toBe(0)
    expect(r.itens[0].tipoPreco).toBe('VAREJO')
  })
})
