/**
 * PRODUCT ENGINE — ÚNICA fonte de decisão de negócio de produto.
 *
 * Consolidation of:
 * - shared-core/src/engine/productEngine.ts (core rules)
 * - pdv-importados/core/catalog/statusPublicacao.ts (transformations)
 *
 * Nada no sistema pode decidir vendabilidade, status ou elegibilidade de PDV
 * fora deste motor. Consumidores (server actions, PDV, pdv-local, sync) apenas
 * chamam o engine; nunca reimplementam a regra.
 *
 * Puro: sem React, sem DB, sem efeito colateral.
 */

import type { StatusPublicacao, ProdutoOrigem } from './types'

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

/**
 * TRANSFORMATION FUNCTIONS — status/ativo conversions
 */

export function ativoFromStatusPublicacao(status: StatusPublicacao): boolean {
  return status === 'PUBLICADO'
}

export function statusFromAtivoLegacy(ativo: boolean): StatusPublicacao {
  return ativo ? 'PUBLICADO' : 'INATIVO'
}

/** Novo cadastro manual / CSV sem override explícito → DRAFT até publicar. */
export function defaultStatusNovoProduto(input: {
  status_publicacao?: StatusPublicacao
  ativo?: boolean
}): { status_publicacao: StatusPublicacao; ativo: boolean } {
  if (input.status_publicacao) {
    const status = input.status_publicacao
    return { status_publicacao: status, ativo: ativoFromStatusPublicacao(status) }
  }
  if (input.ativo === true) {
    return { status_publicacao: 'PUBLICADO', ativo: true }
  }
  if (input.ativo === false) {
    return { status_publicacao: 'DRAFT', ativo: false }
  }
  return { status_publicacao: 'DRAFT', ativo: false }
}

export function dualWriteFromStatus(
  status: StatusPublicacao,
): { status_publicacao: StatusPublicacao; ativo: boolean } {
  return { status_publicacao: status, ativo: ativoFromStatusPublicacao(status) }
}

/** Leitura pessimista R1+: ausente → INATIVO (não inferir de ativo). */
export function resolveStatusPublicacaoLeitura(
  status: StatusPublicacao | null | undefined,
  _ativo?: boolean | null,
): StatusPublicacao {
  if (status === 'DRAFT' || status === 'PUBLICADO' || status === 'INATIVO') {
    return status
  }
  return 'INATIVO'
}

/** Vendabilidade PDV — delega regra única local. */
export function isVendavelPdv(
  status: StatusPublicacao | null | undefined,
  ativo?: boolean | null,
): boolean {
  return evaluateProduct({ ativo: ativo ?? false, status_publicacao: status ?? null }).vendavel
}

/**
 * Decisão de negócio: só rascunho é publicável (ação "Publicar" individual).
 * A UI consome este predicado — nunca compara status_publicacao por literal
 * (enforçado por scripts/core-rule-guard.mjs).
 */
export function podePublicarProduto(status: StatusPublicacao | null | undefined): boolean {
  return resolveStatusPublicacaoLeitura(status) === 'DRAFT'
}
