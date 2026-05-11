/** Linha de produto na listagem gerente (filtros + tabela). */
export type ProdutoGerenteRow = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  origem: string
  tem_nf: boolean
  ativo: boolean
}
