import { describe, it, expect } from 'vitest'
import {
  mesclarProdutosNoCarrinho,
  toCarrinhoItem,
  type ProdutoParaEtiqueta,
} from './etiquetaCarrinhoMerge'
import type { ItemCarrinho } from '@/lib/etiqueta/types'

const produto = (id: string, over: Partial<ProdutoParaEtiqueta> = {}): ProdutoParaEtiqueta => ({
  id,
  nome: `Produto ${id}`,
  codigo_barras: `cb-${id}`,
  preco_varejo: 10,
  ...over,
})

describe('toCarrinhoItem', () => {
  it('mapeia produto para item com quantidade 1', () => {
    expect(toCarrinhoItem(produto('a'))).toEqual<ItemCarrinho>({
      produtoId: 'a',
      nome: 'Produto a',
      codigoBarras: 'cb-a',
      precoVarejo: 10,
      quantidade: 1,
    })
  })

  it('aceita quantidade inicial e normaliza limites', () => {
    expect(toCarrinhoItem(produto('a'), 12).quantidade).toBe(12)
    expect(toCarrinhoItem(produto('a'), 0).quantidade).toBe(1)
    expect(toCarrinhoItem(produto('a'), 999).quantidade).toBe(500)
  })

  it('normaliza codigo_barras null para string vazia', () => {
    expect(toCarrinhoItem(produto('a', { codigo_barras: null })).codigoBarras).toBe('')
  })
})

describe('mesclarProdutosNoCarrinho', () => {
  it('adiciona produtos novos com quantidade 1', () => {
    const resultado = mesclarProdutosNoCarrinho([], [produto('a'), produto('b')])
    expect(resultado.map((i) => [i.produtoId, i.quantidade])).toEqual([
      ['a', 1],
      ['b', 1],
    ])
  })

  it('incrementa a quantidade de produto já presente', () => {
    const carrinho: ItemCarrinho[] = [toCarrinhoItem(produto('a'))]
    const resultado = mesclarProdutosNoCarrinho(carrinho, [produto('a'), produto('b')])
    expect(resultado.find((i) => i.produtoId === 'a')?.quantidade).toBe(2)
    expect(resultado.find((i) => i.produtoId === 'b')?.quantidade).toBe(1)
  })

  it('usa incremento customizado ao mesclar', () => {
    const resultado = mesclarProdutosNoCarrinho([], [produto('a')], 5)
    expect(resultado[0].quantidade).toBe(5)
    const novamente = mesclarProdutosNoCarrinho(resultado, [produto('a')], 3)
    expect(novamente[0].quantidade).toBe(8)
  })

  it('conta duplicatas dentro do mesmo lote', () => {
    const resultado = mesclarProdutosNoCarrinho([], [produto('a'), produto('a'), produto('a')])
    expect(resultado).toHaveLength(1)
    expect(resultado[0].quantidade).toBe(3)
  })

  it('não muta o carrinho recebido', () => {
    const carrinho: ItemCarrinho[] = [toCarrinhoItem(produto('a'))]
    const snapshot = structuredClone(carrinho)
    mesclarProdutosNoCarrinho(carrinho, [produto('a')])
    expect(carrinho).toEqual(snapshot)
  })

  it('preserva a quantidade existente ao adicionar produto diferente', () => {
    const carrinho: ItemCarrinho[] = [{ ...toCarrinhoItem(produto('a')), quantidade: 5 }]
    const resultado = mesclarProdutosNoCarrinho(carrinho, [produto('b')])
    expect(resultado.find((i) => i.produtoId === 'a')?.quantidade).toBe(5)
  })
})
