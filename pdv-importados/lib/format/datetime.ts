import { RELATORIO_TZ_PADRAO } from '@/lib/relatorios/periodoRelatorio'

/**
 * Fuso de negócio das datas/horas exibidas ao usuário. Sem `timeZone` explícito, `toLocaleString` usa o
 * fuso do runtime — UTC em Server Components (Vercel) e o fuso do navegador em Client Components —, o que
 * fazia a MESMA venda aparecer 3h adiantada no Dashboard (servidor) e correta em Vendas.
 * Mesma constante dos relatórios (`RELATORIO_TZ_PADRAO`); não duplicar o literal.
 */
export const FUSO_NEGOCIO = RELATORIO_TZ_PADRAO

/**
 * Formata data/hora para tabelas do painel gerencial (locale do usuário).
 * `timeStyle`: `short` — hora sem segundos; `medium` — inclui segundos quando o locale exibir.
 */
export function formatDateTimeOrDash(
  value: string | Date | null | undefined,
  locale: string,
  timeStyle: 'short' | 'medium' = 'short',
): string {
  if (value == null || value === '') return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(locale, { dateStyle: 'short', timeStyle, timeZone: FUSO_NEGOCIO })
}

/**
 * Equivalente a `Date#toLocaleString(locale)` sem opções, com o mesmo critério de “—” que `formatDateTimeOrDash`.
 * Em Server Components (Node em UTC) passe `timeZone` (fuso da loja); sem ele usa o fuso de negócio (`FUSO_NEGOCIO`).
 */
export function formatDateTimeLocaleDefault(
  value: string | Date | null | undefined,
  locale: string,
  timeZone?: string,
): string {
  if (value == null || value === '') return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(locale, { timeZone: timeZone ?? FUSO_NEGOCIO })
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Data SEM horário (ex.: `vencimento`, coluna `date` → "YYYY-MM-DD"). É um dia civil, não um instante:
 * interpretar como meia-noite UTC e converter para São Paulo mostraria o dia anterior (21:00). Por isso
 * o dia é formatado em UTC, sem deslocamento. Se vier um instante completo, usa o fuso de negócio.
 */
export function formatDateOrDash(value: string | Date | null | undefined, locale: string): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'string' && YMD.test(value)) {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString(locale, { dateStyle: 'short', timeZone: 'UTC' })
  }
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(locale, { dateStyle: 'short', timeZone: FUSO_NEGOCIO })
}

/**
 * Dia/mês para eixos de gráfico (ex.: admin dashboard).
 * Recebe um dia civil montado no fuso do runtime (`new Date(y, m, d)` / `setHours(0,0,0,0)`), não um
 * instante de negócio — por isso NÃO converte para o fuso de negócio (deslocaria o dia).
 */
export function formatDayMonthInLocale(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
}
