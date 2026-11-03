import type { OrigemProdutoCaixa, ProdutoCaixaDTO } from '@/app/caixa/caixaActionTypes'
import { normalizarUnidadeMedida } from '@shared/format/unidadeMedida'

/** Remove caracteres perigosos para padrão ILIKE. */
export function sanitizeIlikeFragment(s: string): string {
  return s.replace(/[%_\\]/g, '').trim()
}

/** Início/fim (inclusive) da faixa Unicode "Combining Diacritical Marks". */
const COMBINING_DIACRITICS_START = 0x0300
const COMBINING_DIACRITICS_END = 0x036f

/**
 * Remove acentos pro mesmo critério usado pela coluna gerada `nome_sem_acento`
 * (migration 20260831100000, wrapper IMMUTABLE sobre `unaccent`). NFD decompõe
 * cada caractere acentuado em base + marca combinante (ex.: "é" vira "e" +
 * acento agudo combinante); o filtro abaixo descarta code points na faixa
 * Unicode "Combining Diacritical Marks" (U+0300–U+036F), que cobre a família
 * de acentos latinos usada em português (inclui cedilha: "ç" vira "c" +
 * cedilha combinante U+0327). Filtra por code point em vez de regex com
 * caractere literal — evita qualquer ambiguidade de transcrição/encoding do
 * próprio caractere combinante no código-fonte.
 */
export function semAcento(s: string): string {
  const normalized = s.normalize('NFD')
  let out = ''
  for (const ch of normalized) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= COMBINING_DIACRITICS_START && code <= COMBINING_DIACRITICS_END) continue
    out += ch
  }
  return out
}

export function mapProdutoRow(
  r: {
    id: string
    nome: string
    codigo_barras: string | null
    codigo_interno?: string | null
    preco_varejo: number | string
    preco_atacado?: number | string | null
    categoria_id: string | null
    origem: OrigemProdutoCaixa
    tem_nf: boolean
    observacao: string | null
    unidade_medida?: string | null
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
    codigo_interno: r.codigo_interno ?? null,
    preco_varejo: Number(r.preco_varejo),
    preco_atacado: pa === null || pa === undefined ? null : Number(pa),
    categoria_id: r.categoria_id,
    origem: r.origem,
    tem_nf: Boolean(r.tem_nf),
    observacao: obs,
    unidade_medida: normalizarUnidadeMedida(r.unidade_medida),
    quantidade_estoque,
    estoque_minimo,
  }
}

export const PRODUTO_COLS =
  'id, nome, codigo_barras, codigo_interno, preco_varejo, preco_atacado, categoria_id, origem, tem_nf, observacao, unidade_medida, ativo, status_publicacao' as const
