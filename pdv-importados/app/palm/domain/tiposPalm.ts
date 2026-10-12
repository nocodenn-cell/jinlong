export type ProdutoPalm = {
  id: string
  nome: string
  codigo: string | null
  descricao: string | null
  imagem: string | null
  localizacao: string | null
  estoque: number | null
  estoqueMinimo: number | null
  baixo: boolean
  precoVarejo: number | null
  precoAtacado: number | null
  atacadoMinimo: number | null
}

export type MeuPedidoPalm = {
  id: string
  numeroLocal: number
  status: string
  total: number
  criadaEm: string
  qtdItens: number
}

export type PedidoPalmCard = {
  id: string
  numeroLocal: number
  qtdItens: number
  total: number
  criadaEm: string
  vendedorNome: string | null
}
