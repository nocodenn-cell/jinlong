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
 * Normalização canônica de discriminadores textuais vindos de fora do motor.
 *
 * No Postgres, `tipo_regra` tem CHECK ('PRODUTO','CATEGORIA') e `tipo_desconto`
 * chega uppercase — mas o pdv-local consome cópias sincronizadas em SQLite
 * (sem CHECK) e o PricingService compara `tipo` por igualdade EXATA. Uma linha
 * com caixa divergente passaria silenciosamente como não-match (preço varejo
 * mantido, sem desconto). Normalizar aqui torna a garantia explícita no único
 * ponto de entrada do motor, em vez de depender do transporte.
 */
function normalizeDiscriminator(value: string): string {
  return String(value ?? '').trim().toUpperCase()
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

  const tipoRegra = normalizeDiscriminator(row.tipo_regra)
  const tipoDesconto = normalizeDiscriminator(row.tipo_desconto)

  return {
    id: row.id,
    nome: row.tipo_regra,
    tipo: tipoRegra === 'PRODUTO' ? 'VAREJO' : 'ATACADO',
    minQuantidade: qMin,
    maxQuantidade: qMax,
    quantidadeMinima: qMin,
    quantidadeMaxima: qMax,
    descontoPercentual: tipoDesconto === 'PERCENTUAL' ? Number(row.valor_desconto) : undefined,
    valorDesconto: Number(row.valor_desconto),
    precoFixo: tipoDesconto === 'VALOR_FIXO' ? Number(row.valor_desconto) : undefined,
    produtoId: row.produto_id ?? undefined,
    categoriaId: row.categoria_id ?? undefined,
    dataValidade: row.data_validade,
    ativo: row.ativo,
  }
}
