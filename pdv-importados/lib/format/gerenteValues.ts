import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { formatBRL } from '@/lib/format/money'

/** Valor monetário na área gerente (mesma regra que o restante do app). */
export function fmtGerenteBRL(value: number, locale: string): string {
  return formatBRL(value, locale)
}

export function fmtGerenteDateTime(
  value: string | null | undefined,
  locale: string,
): string {
  return formatDateTimeOrDash(value, locale)
}

/** Exibe prefixo curto de UUID para colunas de id em tabela. */
export function fmtGerenteIdCurto(id: string | null | undefined, len = 8): string {
  if (!id) return '—'
  const s = String(id)
  return s.length <= len ? s : `${s.slice(0, len)}…`
}
