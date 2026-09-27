import { subtrairDiasCivis, ymdHojeNoFusoRelatorio } from '@/lib/relatorios/periodoRelatorio'

/**
 * T9 (auditoria 2026-09-27): antes usava `Date.now() - N*DIA_MS` fatiado em UTC
 * (`toISOString().slice(0,10)`) — "hoje"/"30 dias" ficavam presos ao dia civil
 * em UTC, não no fuso da loja, e "30 dias" subtraía 30 dias inteiros da hora
 * atual (não do início do dia civil), um dia a mais do que os últimos 30 dias
 * civis. Resultado: "30 dias" em Comissões (28/08→27/09) não batia com
 * Relatórios (29/08→27/09), que já usa `subtrairDiasCivis(hoje, 29)`. Mesmo
 * helper agora nos dois lugares.
 *
 * Extraído de `page.tsx` (não `periodo.test.ts`) porque Server Components no
 * App Router só podem exportar campos reservados (`default`, `metadata`
 * etc.) — um `export const` qualquer quebra o build (`"X" is not a valid
 * Page export field`).
 */
export const TODAY = ymdHojeNoFusoRelatorio()
export const DE_7D = subtrairDiasCivis(TODAY, 6)
export const DE_30D = subtrairDiasCivis(TODAY, 29)
