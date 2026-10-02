/**
 * Boundary puro: fornecedor_id opcional deve pertencer à loja da OC.
 * Retorna mensagem de erro ou null se ok / sem fornecedor.
 */
export function mensagemSeFornecedorForaDaLoja(opts: {
  fornecedorId: string | null | undefined
  fornecedorLojaId: string | null | undefined
  lojaIdOc: string
}): string | null {
  if (!opts.fornecedorId) return null
  if (!opts.fornecedorLojaId || opts.fornecedorLojaId !== opts.lojaIdOc) {
    return 'Fornecedor inválido para esta loja.'
  }
  return null
}

/**
 * Boundary puro: todo produto_id referenciado pelos itens da OC deve
 * pertencer à loja da OC. `produtosEncontrados` é o resultado de UMA única
 * consulta (`select id, loja_id ... in (produtoIds)`) — não uma leitura por
 * item, para não gerar N queries em OCs com muitos itens.
 *
 * Mesma mensagem para "não encontrado" e "de outra loja": o SELECT em
 * `produtos` já é limitado pela RLS à loja do chamador (ou a ADMIN), então
 * um id de outra loja tende a nem aparecer em `produtosEncontrados` — a
 * checagem explícita de `loja_id` aqui é defesa em profundidade (mesmo
 * padrão de `mensagemSeFornecedorForaDaLoja` acima), não confiando apenas na
 * RLS.
 */
export function mensagemSeProdutosForaDaLoja(opts: {
  produtoIds: string[]
  produtosEncontrados: Array<{ id: string; loja_id: string | null }>
  lojaIdOc: string
}): string | null {
  if (opts.produtoIds.length === 0) return null
  const lojaPorProduto = new Map(opts.produtosEncontrados.map((p) => [p.id, p.loja_id]))
  for (const produtoId of opts.produtoIds) {
    const lojaDoProduto = lojaPorProduto.get(produtoId)
    if (!lojaDoProduto || lojaDoProduto !== opts.lojaIdOc) {
      return 'Produto inválido para esta loja.'
    }
  }
  return null
}
