export type CategoriaFinanceiraTipo = 'RECEITA' | 'DESPESA' | 'AMBOS'

export type CategoriaFinanceiraRow = Readonly<{
  id: string
  nome: string
  tipo: CategoriaFinanceiraTipo
  ativo: boolean
  created_at: string
}>
