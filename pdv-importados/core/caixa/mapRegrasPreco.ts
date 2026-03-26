/**
 * Converte linhas de `public.regras_preco` (Supabase) para o tipo do motor de preço.
 */
import type { RegraPreco } from '@/core/pricing/types'

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
    tipoRegra: row.tipo_regra as 'PRODUTO' | 'CATEGORIA',
    produtoId: row.produto_id ?? undefined,
    categoriaId: row.categoria_id ?? undefined,
    quantidadeMinima: qMin,
    quantidadeMaxima: qMax,
    tipoDesconto: row.tipo_desconto as 'PERCENTUAL' | 'VALOR_FIXO',
    valorDesconto: Number(row.valor_desconto),
    dataValidade: row.data_validade ?? undefined,
    ativo: row.ativo,
  }
}
