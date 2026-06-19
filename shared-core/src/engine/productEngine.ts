/**
 * PRODUCT ENGINE — ÚNICA fonte de decisão de negócio de produto.
 *
 * Nada no sistema pode decidir vendabilidade, status ou elegibilidade de PDV
 * fora deste motor. Consumidores (server actions, PDV, pdv-local, sync) apenas
 * chamam o engine; nunca reimplementam a regra.
 *
 * Puro: sem React, sem DB, sem efeito colateral.
 */

export type StatusPublicacao = 'DRAFT' | 'PUBLICADO' | 'INATIVO'
export type ProdutoOrigem = 'human' | 'import'

/**
 * Configuração DECLARATIVA das regras de produto (a "constituição").
 * É só dado; a decisão (lógica) vive nas funções abaixo.
 */
export const PRODUCT_RULES = {
  /** Cadastro manual (humano) → vendável na hora. */
  createdByHuman: { status_publicacao: 'PUBLICADO', ativo: true },
  /** Importação (CSV/NF-e) → rascunho até publicação explícita. */
  createdByImport: { status_publicacao: 'DRAFT', ativo: false },
  /** Requisitos para um produto ser vendável no PDV. */
  vendavel: { ativo: true, status_publicacao: 'PUBLICADO' },
} as const

export type ProdutoAvaliavel = {
  ativo?: boolean | null
  status_publicacao?: StatusPublicacao | string | null
}

export type ProdutoAvaliado = {
  status_publicacao: StatusPublicacao | null
  ativo: boolean
  /** Verdade ÚNICA de vendabilidade: ativo === true && status_publicacao === 'PUBLICADO'. */
  vendavel: boolean
}

/**
 * Avalia um produto: normaliza status/ativo e decide vendabilidade.
 * ÚNICO lugar que decide se um produto é vendável.
 */
export function evaluateProduct(product: ProdutoAvaliavel): ProdutoAvaliado {
  const ativo = product.ativo === true
  const status = (product.status_publicacao ?? null) as StatusPublicacao | null
  const vendavel = ativo && status === PRODUCT_RULES.vendavel.status_publicacao
  return { status_publicacao: status, ativo, vendavel }
}

/**
 * Decide o status inicial de um produto recém-criado, por origem.
 * ÚNICO lugar que decide PUBLICADO vs DRAFT no cadastro.
 */
export function statusInicialProduto(
  origem: ProdutoOrigem,
): { status_publicacao: StatusPublicacao; ativo: boolean } {
  const regra = origem === 'human' ? PRODUCT_RULES.createdByHuman : PRODUCT_RULES.createdByImport
  return { status_publicacao: regra.status_publicacao, ativo: regra.ativo }
}
