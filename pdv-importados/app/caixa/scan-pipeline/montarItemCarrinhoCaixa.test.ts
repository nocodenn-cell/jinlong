import { describe, expect, it } from 'vitest'
import { avisoEstoqueCaixa, montarItemCarrinhoCaixa } from './montarItemCarrinhoCaixa'
import type { ProdutoCaixaDTO } from '@/app/caixa/caixaActionTypes'
import type { Mensagens } from '@/i18n/getMessages'

function produto(over: Partial<ProdutoCaixaDTO> = {}): ProdutoCaixaDTO {
  return {
    id: 'p-1',
    nome: 'Cadeira Vermelha Grande',
    codigo_barras: null,
    codigo_interno: null,
    preco_varejo: 220,
    preco_atacado: null,
    categoria_id: null,
    origem: 'brasil_nf',
    tem_nf: true,
    observacao: null,
    quantidade_estoque: 5,
    estoque_minimo: 1,
    ...over,
  }
}

const m = {
  caixa: {
    item_adicionado: 'Adicionado.',
    estoque_baixo: 'Atenção: estoque baixo ou zero.',
    estoque_abaixo_minimo: 'Atenção: estoque no ou abaixo do mínimo cadastrado.',
  },
} as unknown as Mensagens

describe('montarItemCarrinhoCaixa — Onda 2 · Bloco 2 (diferenciador no carrinho)', () => {
  it('sku prioriza código de barras sobre código interno', () => {
    const item = montarItemCarrinhoCaixa(
      produto({ codigo_barras: '7891000000001', codigo_interno: 'CAD-VERM-G' }),
      220,
      'VAREJO',
    )
    expect(item.sku).toBe('7891000000001')
  })

  it('sem código de barras, usa o código interno (SKU)', () => {
    const item = montarItemCarrinhoCaixa(produto({ codigo_interno: 'CAD-VERM-G' }), 220, 'VAREJO')
    expect(item.sku).toBe('CAD-VERM-G')
  })

  it('sem nenhum dos dois, sku fica undefined (a UI omite a linha)', () => {
    const item = montarItemCarrinhoCaixa(produto(), 220, 'VAREJO')
    expect(item.sku).toBeUndefined()
  })

  it('monta o item com o preço já calculado (autoritativo), não o preço de tabela', () => {
    const item = montarItemCarrinhoCaixa(produto({ preco_varejo: 220 }), 198, 'ATACADO', 1, 6)
    expect(item.precoUnitario).toBe(198)
    expect(item.precoOriginal).toBe(220)
    expect(item.resultado?.tipoPreco).toBe('ATACADO')
    expect(item.resultado?.precoOriginal).toBe(220)
    expect(item.resultado?.descontoUnitario).toBe(22)
    expect(item.resultado?.quantidadeMinima).toBe(6)
    expect(item.metaPdv?.precoVarejoReferencia).toBe(220)
  })

  it('varejo mantém original igual ao unitário e sem mínimo de faixa', () => {
    const item = montarItemCarrinhoCaixa(produto({ preco_varejo: 220 }), 220, 'VAREJO', 1, 6)
    expect(item.precoOriginal).toBe(220)
    expect(item.resultado?.descontoUnitario).toBe(0)
    expect(item.resultado?.quantidadeMinima).toBeNull()
  })
})

describe('avisoEstoqueCaixa — mesma regra usada no scan e na seleção de candidato', () => {
  it('estoque zero: avisa estoque baixo', () => {
    expect(avisoEstoqueCaixa(produto({ quantidade_estoque: 0 }), m)).toContain('estoque baixo')
  })

  it('estoque no mínimo cadastrado: avisa abaixo do mínimo', () => {
    expect(avisoEstoqueCaixa(produto({ quantidade_estoque: 1, estoque_minimo: 1 }), m)).toContain('mínimo')
  })

  it('estoque confortável: sem aviso', () => {
    expect(avisoEstoqueCaixa(produto({ quantidade_estoque: 10, estoque_minimo: 1 }), m)).toBeNull()
  })

  it('sem linha de estoque (null): sem aviso — não é a mesma coisa que zero', () => {
    expect(avisoEstoqueCaixa(produto({ quantidade_estoque: null, estoque_minimo: null }), m)).toBeNull()
  })
})
