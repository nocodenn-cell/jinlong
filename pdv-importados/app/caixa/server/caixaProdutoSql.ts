import type { OrigemProdutoCaixa, ProdutoCaixaDTO } from '@/app/caixa/caixaActionTypes'

/** Remove caracteres perigosos para padrão ILIKE. */
export function sanitizeIlikeFragment(s: string): string {
  return s.replace(/[%_\\]/g, '').trim()
}

export function mapProdutoRow(
  r: {
    id: string
    nome: string
    codigo_barras: string | null
    preco_varejo: number | string
    preco_atacado?: number | string | null
    categoria_id: string | null
    origem: OrigemProdutoCaixa
    tem_nf: boolean
    observacao: string | null
  },
  quantidade_estoque: number | null,
  estoque_minimo: number | null,
): ProdutoCaixaDTO {
  const pa = r.preco_atacado
  const obs =
    r.observacao == null || String(r.observacao).trim() === ''
      ? null
      : String(r.observacao).trim()
  return {
    id: r.id,
    nome: r.nome,
    codigo_barras: r.codigo_barras,
    preco_varejo: Number(r.preco_varejo),
    preco_atacado: pa === null || pa === undefined ? null : Number(pa),
    categoria_id: r.categoria_id,
    origem: r.origem,
    tem_nf: Boolean(r.tem_nf),
    observacao: obs,
    quantidade_estoque,
    estoque_minimo,
  }
}

export const PRODUTO_COLS =
  'id, nome, codigo_barras, preco_varejo, preco_atacado, categoria_id, origem, tem_nf, observacao, ativo, status_publicacao' as const
