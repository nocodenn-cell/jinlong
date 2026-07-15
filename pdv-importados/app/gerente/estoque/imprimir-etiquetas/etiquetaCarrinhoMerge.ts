import type { ItemCarrinho } from '@/lib/etiqueta/types'

/** Produto mínimo aceito pelo carrinho de etiquetas. */
export type ProdutoParaEtiqueta = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
}

export function toCarrinhoItem(produto: ProdutoParaEtiqueta): ItemCarrinho {
  return {
    produtoId: produto.id,
    nome: produto.nome,
    codigoBarras: produto.codigo_barras || '',
    precoVarejo: produto.preco_varejo,
    quantidade: 1,
  }
}

/**
 * Mescla uma lista de produtos no carrinho de etiquetas.
 * Produto já presente tem a quantidade incrementada em 1; novo é adicionado
 * com quantidade 1. Função pura — não muta a lista recebida.
 */
export function mesclarProdutosNoCarrinho(
  carrinho: readonly ItemCarrinho[],
  produtos: readonly ProdutoParaEtiqueta[],
): ItemCarrinho[] {
  const next = [...carrinho]
  for (const produto of produtos) {
    const idx = next.findIndex((item) => item.produtoId === produto.id)
    if (idx >= 0) {
      next[idx] = { ...next[idx], quantidade: next[idx].quantidade + 1 }
    } else {
      next.push(toCarrinhoItem(produto))
    }
  }
  return next
}
