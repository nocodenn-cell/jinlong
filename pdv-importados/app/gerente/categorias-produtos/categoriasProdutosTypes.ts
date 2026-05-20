export type CategoriaProdutoRow = Readonly<{
  id: string
  nome: string
  ativo: boolean
  categoria_pai_id: string | null
  qtd_produtos: number
  created_at: string
}>
