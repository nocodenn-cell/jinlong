/**
 * Vendabilidade PDV — WRAPPER fino do motor único `productEngine`.
 *
 * Não contém regra própria: delega a decisão a `evaluateProduct`. Mantido como
 * API estável de catálogo (caixa web, pdv-local, validação pós-sync) para não
 * quebrar imports existentes.
 */
import { evaluateProduct, PRODUCT_RULES, type StatusPublicacao } from '../domain/product/engine'

export type { StatusPublicacao }

export const STATUS_PUBLICACAO_PUBLICADO = PRODUCT_RULES.vendavel.status_publicacao

export type ProdutoVendavelFields = {
  ativo: boolean | null | undefined
  status_publicacao?: StatusPublicacao | string | null
}

/** Delegação ao motor único — não reimplementar a regra aqui. */
export function isProdutoVendavel(produto: ProdutoVendavelFields): boolean {
  return evaluateProduct(produto).vendavel
}

export function filterProdutosVendaveis<T extends ProdutoVendavelFields>(produtos: T[]): T[] {
  return produtos.filter(isProdutoVendavel)
}

/** Colunas Supabase PostgREST — derivadas da config declarativa do engine. */
export const FILTRO_PRODUTO_VENDAVEL = {
  ativo: PRODUCT_RULES.vendavel.ativo,
  status_publicacao: PRODUCT_RULES.vendavel.status_publicacao,
} as const
