/**
 * Consolidated product domain types — single source of truth
 *
 * All product-related types defined here:
 * - StatusPublicacao: publication state (DRAFT | PUBLICADO | INATIVO)
 * - ProdutoOrigem: product creation origin (human | import)
 * - OrigemProduto: legacy alias for origin
 * - UnidadeMedida: measurement unit (UN | KG | CX | FD | M)
 *
 * Zero duplication across shared-core and pdv-importados.
 */

export type StatusPublicacao = 'DRAFT' | 'PUBLICADO' | 'INATIVO'
export type ProdutoOrigem = 'human' | 'import'
export type OrigemProduto = 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'
export type UnidadeMedida = 'UN' | 'KG' | 'CX' | 'FD' | 'M'
