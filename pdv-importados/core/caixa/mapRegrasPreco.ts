/**
 * Conversão de linhas de `public.regras_preco` (Supabase) para o tipo do motor
 * de preço.
 *
 * FONTE ÚNICA: `shared-core/src/caixa/mapRegrasPreco`. Este módulo apenas
 * reexporta para os consumidores web que importam via `@/core/caixa/...`,
 * eliminando a segunda implementação (que omitia campos como quantidadeMinima/
 * quantidadeMaxima/valorDesconto/produtoId/categoriaId).
 */
export { mapRegraPrecoRow } from '@shared-core/src/caixa/mapRegrasPreco'
export type { RegraPrecoRow } from '@shared-core/src/caixa/mapRegrasPreco'
