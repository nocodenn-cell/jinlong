import {
  FILTRO_PRODUTO_VENDAVEL,
  isProdutoVendavel,
  STATUS_PUBLICACAO_PUBLICADO,
  type ProdutoVendavelFields,
} from '@/lib/catalog/isProdutoVendavel'

export { isProdutoVendavel, STATUS_PUBLICACAO_PUBLICADO }
export type { ProdutoVendavelFields }

/**
 * Único ponto autorizado para traduzir `isProdutoVendavel` em filtro SQL Supabase.
 * Demais camadas de venda devem usar esta função + validação `isProdutoVendavel` pós-leitura.
 */
type SupabaseEqChain = { eq(column: string, value: unknown): SupabaseEqChain }

export function aplicarFiltroProdutoVendavel<Q extends SupabaseEqChain>(query: Q): Q {
  return query
    .eq('ativo', FILTRO_PRODUTO_VENDAVEL.ativo)
    .eq('status_publicacao', FILTRO_PRODUTO_VENDAVEL.status_publicacao) as Q
}

/** Validação defensiva pós-query — rejeita drift ou bypass de filtro SQL. */
export function filtrarSomenteProdutosVendaveis<T extends ProdutoVendavelFields>(rows: T[]): T[] {
  return rows.filter(isProdutoVendavel)
}

/** Primeiro produto vendável ou undefined (scan/busca caixa). */
export function primeiroProdutoVendavel<T extends ProdutoVendavelFields>(
  rows: T[],
): T | undefined {
  return rows.find(isProdutoVendavel)
}
