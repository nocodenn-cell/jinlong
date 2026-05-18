/** Linha de produto na listagem gerente (filtros + tabela). */
export type ProdutoGerenteRow = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  preco_atacado: number | null
  quantidade_gatilho_atacado: number | null
  origem: string
  tem_nf: boolean
  ativo: boolean
  /** URL pública (Storage) ou null. */
  imagem_url: string | null
  categoria_id: string | null
  marca_id: string | null
  fornecedor_id: string | null
  unidade_medida: string
  observacao: string | null
}
