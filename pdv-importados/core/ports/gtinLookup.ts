import type { FonteSugestaoCadastro } from '@/core/catalog/sugestaoCadastro'

export type GtinLookupHit = Readonly<{
  gtin: string
  nome: string | null
  ncm: string | null
  marca: string | null
  categoriaExterna: string | null
  fonte: FonteSugestaoCadastro
}>

export type SugestaoCadastroProduto = Readonly<{
  gtin: string
  nome: string | null
  precoVarejo: number | null
  precoCusto: number | null
  ncm: string | null
  categoriaId: string | null
  categoriaNome: string | null
  marca: string | null
  fontes: FonteSugestaoCadastro[]
  /** Já existe no catálogo da loja — UI deve evitar criar duplicata. */
  jaCadastrado: boolean
  produtoIdExistente: string | null
  /** Nome+preço preenchidos pela inteligência (meta &lt; 8s). */
  knownSuggestion: boolean
}>
