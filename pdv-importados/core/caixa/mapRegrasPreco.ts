/**
 * Converte linhas de `public.regras_preco` (Supabase) para o tipo do motor de preço.
 */
import type { RegraPreco } from '..../shared/pricing/types'

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

export function mapRegraPrecoRow(row: RegraPrecoRow): RegraPreco {
  const qMin = Number(row.quantidade_minima)
  const qMax =
    row.quantidade_maxima === null || row.quantidade_maxima === undefined
      ? undefined
      : Number(row.quantidade_maxima)

  return {
    id: row.id,
    nome: row.tipo_regra,
    tipo: row.tipo_regra === 'PRODUTO' ? 'VAREJO' : 'ATAcado',
    minQuantidade: qMin,
    maxQuantidade: qMax,
    descontoPercentual: row.tipo_desconto === 'PERCENTUAL' ? Number(row.valor_desconto) : undefined,
    precoFixo: row.tipo_desconto === 'VALOR_FIXO' ? Number(row.valor_desconto) : undefined,
    ativo: row.ativo,
  }
}
