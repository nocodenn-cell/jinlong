export type CategoriaRow = Readonly<{
  id: string
  nome: string
  categoria_pai_id: string | null
  ativo: boolean
}>

