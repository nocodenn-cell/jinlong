/**
 * Defaults da listagem gerente de produtos.
 * Não pode ficar em `actions.ts` com `use server`: Next exige que esse módulo só exporte async functions.
 */
export const DEFAULT_BUSCAR_PRODUTOS_FILTROS = {
  situacao: 'todos' as const,
  origem: 'all' as const,
  nf: 'all' as const,
  estoque: 'todos' as const,
  imagens: 'todos' as const,
  tags: [] as string[],
  categoriaId: undefined as string | undefined,
  marcaId: undefined as string | undefined,
  fornecedorId: undefined as string | undefined,
  busca: '',
  page: 1,
  pageSize: 10,
}
