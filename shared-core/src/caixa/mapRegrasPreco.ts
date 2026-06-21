import type { RegraPreco } from '../pricing/types'

export type RegraPrecoRow = {
  id: string
  tipo_regra: string
  produto_id: string | null
  categoria_id: string | null
  quantidade_minima: number | string
  quantidade_maxima: number | string | null
  tipo_desconto: string
  valor_desconto: number | string
  data_validade: string | null
  ativo: boolean
}

/**
 * Converte linhas de regras_preco para o tipo do motor de preço.
 */
export function mapRegraPrecoRow(row: RegraPrecoRow): RegraPreco {
  const qMin = Number(row.quantidade_minima)
  const qMax =
    row.quantidade_maxima === null || row.quantidade_maxima === undefined
      ? undefined
      : Number(row.quantidade_maxima)

  return {
    id: row.id,
    nome: row.tipo_regra,
    tipo: row.tipo_regra === 'PRODUTO' ? 'VAREJO'
        : row.tipo_regra === 'PROMOCAO' ? 'PROMOCAO'
        : 'ATACADO',
    minQuantidade: qMin,
    maxQuantidade: qMax,
    quantidadeMinima: qMin,
    quantidadeMaxima: qMax,
    descontoPercentual: row.tipo_desconto === 'PERCENTUAL' ? Number(row.valor_desconto) : undefined,
    valorDesconto: Number(row.valor_desconto),
    precoFixo: row.tipo_desconto === 'VALOR_FIXO' ? Number(row.valor_desconto) : undefined,
    produtoId: row.produto_id ?? undefined,
    categoriaId: row.categoria_id ?? undefined,
    dataValidade: row.data_validade,
    ativo: row.ativo,
  }
}
