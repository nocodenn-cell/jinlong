import type { ProdutoCaixaDTO } from '@/app/caixa/caixaActionTypes'

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
  },
  quantidade_estoque: number | null,
): ProdutoCaixaDTO {
  const pa = r.preco_atacado
  return {
    id: r.id,
    nome: r.nome,
    codigo_barras: r.codigo_barras,
    preco_varejo: Number(r.preco_varejo),
    preco_atacado: pa === null || pa === undefined ? null : Number(pa),
    categoria_id: r.categoria_id,
    quantidade_estoque,
  }
}

export const PRODUTO_COLS =
  'id, nome, codigo_barras, preco_varejo, preco_atacado, categoria_id' as const
