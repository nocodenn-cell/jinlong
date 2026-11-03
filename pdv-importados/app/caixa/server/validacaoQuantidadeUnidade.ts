import { normalizarUnidadeMedida, quantidadeValidaParaUnidade } from '@shared/format/unidadeMedida'

export type ItemQuantidadeUnidade = { produtoId: string; quantidade: number }
export type ProdutoUnidade = { id: string; nome: string; unidade_medida: string | null }

/**
 * Primeiro item cuja quantidade a unidade do produto não aceita (ex.: 2,5 de UN), ou null.
 * Função pura: a checagem de servidor de `recalcularItensNoServidor` usa esta regra.
 * Produto ausente da lista é ignorado aqui (a checagem de produtos válidos é feita antes).
 */
export function primeiroItemComQuantidadeInvalida(
  itens: ReadonlyArray<ItemQuantidadeUnidade>,
  produtos: ReadonlyArray<ProdutoUnidade>,
): { nome: string; unidade: string } | null {
  const porId = new Map(produtos.map((p) => [p.id, p]))
  for (const item of itens) {
    const produto = porId.get(item.produtoId)
    if (!produto) continue
    const unidade = normalizarUnidadeMedida(produto.unidade_medida)
    if (!quantidadeValidaParaUnidade(item.quantidade, unidade)) {
      return { nome: produto.nome, unidade }
    }
  }
  return null
}
