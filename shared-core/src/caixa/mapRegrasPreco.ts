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
 * Normalização canônica de discriminadores textuais de `regras_preco`.
 *
 * ⚠️ `regras_preco` NÃO é autoridade de preço (ver MATRIZ_PRECO_FINAL.md §Legado).
 * O preço automático é resolvido exclusivamente por `calcular_preco_produto` ≡
 * `PRICE_RESOLUTION_CHAIN`. Este mapper permanece apenas como transporte legado
 * (as linhas são sincronizadas/armazenadas mas nenhum consumidor as aplica ao
 * preço). Mantém-se a normalização de caixa para não deixar dados inconsistentes
 * em `pdv-local` (SQLite sem CHECK) enquanto o plumbing legado não é removido.
 */
function normalizeDiscriminator(value: string): string {
  return String(value ?? '').trim().toUpperCase()
}

/**
 * Converte linhas de regras_preco para RegraPreco (transporte legado — não é
 * consumido pelo cálculo de preço; ver MATRIZ_PRECO_FINAL.md).
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
