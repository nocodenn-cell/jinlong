/**
 * Regra única de vendabilidade PDV (R1 transição):
 * `ativo === true` AND `status_publicacao === 'PUBLICADO'`.
 *
 * Usada por caixa web, pdv-local e validação pós-sync.
 * Não substitui dual-write no cadastro — apenas leitura defensiva.
 */
export type StatusPublicacao = 'DRAFT' | 'PUBLICADO' | 'INATIVO'

export const STATUS_PUBLICACAO_PUBLICADO = 'PUBLICADO' as const satisfies StatusPublicacao

export type ProdutoVendavelFields = {
  ativo: boolean | null | undefined
  status_publicacao?: StatusPublicacao | string | null
}

export function isProdutoVendavel(produto: ProdutoVendavelFields): boolean {
  return produto.ativo === true && produto.status_publicacao === STATUS_PUBLICACAO_PUBLICADO
}

export function filterProdutosVendaveis<T extends ProdutoVendavelFields>(produtos: T[]): T[] {
  return produtos.filter(isProdutoVendavel)
}

/** Colunas Supabase PostgREST — aplicar em sequência no query builder. */
export const FILTRO_PRODUTO_VENDAVEL = {
  ativo: true,
  status_publicacao: STATUS_PUBLICACAO_PUBLICADO,
} as const
