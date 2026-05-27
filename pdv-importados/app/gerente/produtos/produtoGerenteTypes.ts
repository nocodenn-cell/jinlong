/** Linha de produto na listagem gerente (filtros + tabela). */
export type ProdutoGerenteRow = {
  id: string
  nome: string
  codigo_barras: string | null
  /** Código interno / SKU do produto. */
  codigo_interno: string | null
  /** Localização física na loja (ex: "A-12", "ESTANTE 3"). */
  localizacao_prateleira: string | null
  preco_varejo: number
  preco_atacado: number | null
  quantidade_gatilho_atacado: number | null
  /** Estoque atual (da tabela estoque). Negativo = ruptura. */
  quantidade_atual: number | null
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
  tags: string[] | null
}
