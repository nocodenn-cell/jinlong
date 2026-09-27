import {
  inicioDoDiaCivilEmUtc,
  subtrairDiasCivis,
  ymdHojeNoFusoRelatorio,
} from '@/lib/relatorios/periodoRelatorio'

export type Periodo = 'tudo' | 'hoje' | 'ontem' | '7d' | 'mes'

const DIA_MS = 86_400_000

/**
 * T9 (auditoria 2026-09-27): antes usava `new Date()` + `.setHours()`/`.setDate()`,
 * que operam no fuso do processo Node (UTC em produção) — a "meia-noite" ficava
 * até 3h deslocada da meia-noite real da loja. E o preset "mes" (rotulado "30
 * dias") calculava o início do MÊS CIVIL atual, não uma janela de 30 dias — por
 * isso "30 dias" em Vendas não batia com "30 dias" em Relatórios/Comissões.
 * Agora os três (`hoje`, `ontem`, `mes`→30 dias) usam os mesmos limites de dia
 * civil, no mesmo fuso, que `lib/relatorios/periodoRelatorio.ts` já usa em
 * Relatórios — `mes` deixa de ser mês civil e passa a ser os últimos 30 dias
 * civis, igual ao rótulo sempre disse.
 *
 * Extraído de `page.tsx` (não `periodoInicio.test.ts`) porque Server
 * Components no App Router só podem exportar campos reservados (`default`,
 * `metadata` etc.) — um `export function`/`export type` qualquer quebra o
 * build (`"X" is not a valid Page export field`).
 */
export function periodoInicio(periodo: Periodo): string | null {
  const hojeYmd = ymdHojeNoFusoRelatorio()
  if (periodo === 'hoje') return inicioDoDiaCivilEmUtc(hojeYmd).toISOString()
  if (periodo === 'ontem') return inicioDoDiaCivilEmUtc(subtrairDiasCivis(hojeYmd, 1)).toISOString()
  if (periodo === '7d') return new Date(Date.now() - 7 * DIA_MS).toISOString()
  if (periodo === 'mes') return inicioDoDiaCivilEmUtc(subtrairDiasCivis(hojeYmd, 29)).toISOString()
  return null
}

export function periodoFim(periodo: Periodo): string | null {
  if (periodo !== 'ontem') return null
  const hojeYmd = ymdHojeNoFusoRelatorio()
  // Fim inclusivo do dia civil de ontem = 1ms antes do início do dia civil de hoje.
  return new Date(inicioDoDiaCivilEmUtc(hojeYmd).getTime() - 1).toISOString()
}
