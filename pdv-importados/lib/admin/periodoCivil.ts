/**
 * Período padrão por DATAS CIVIS (YYYY-MM-DD) no fuso da loja (America/Sao_Paulo), sincronizado com a URL
 * (`?de=&ate=`). Presets: Hoje · 7 dias · Mês atual · Personalizado. Função pura: o "hoje" civil é
 * recebido de fora (servidor calcula com `ymdHojeNoFusoRelatorio`), então os testes não dependem do relógio.
 */
import { subtrairDiasCivis } from '@/lib/relatorios/periodoRelatorio'

export type PresetPeriodoCivil = 'hoje' | '7d' | 'mes' | 'personalizado'

export const PRESETS_PERIODO_CIVIL: readonly Exclude<PresetPeriodoCivil, 'personalizado'>[] = ['hoje', '7d', 'mes']

export type PeriodoCivil = { de: string; ate: string }

export type PeriodoCivilResolvido = PeriodoCivil & {
  preset: PresetPeriodoCivil
  /** true quando o período é o padrão da tela (sem chip, "Limpar" some). */
  ehPadrao: boolean
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

export function ehDataCivil(v: unknown): v is string {
  if (typeof v !== 'string' || !YMD.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function intervaloDoPreset(preset: Exclude<PresetPeriodoCivil, 'personalizado'>, hoje: string): PeriodoCivil {
  switch (preset) {
    case 'hoje':
      return { de: hoje, ate: hoje }
    case '7d':
      return { de: subtrairDiasCivis(hoje, 6), ate: hoje }
    case 'mes':
      return { de: `${hoje.slice(0, 8)}01`, ate: hoje }
  }
}

export function detectarPreset(de: string, ate: string, hoje: string): PresetPeriodoCivil {
  for (const p of PRESETS_PERIODO_CIVIL) {
    const i = intervaloDoPreset(p, hoje)
    if (i.de === de && i.ate === ate) return p
  }
  return 'personalizado'
}

/**
 * Normaliza `?de=&ate=`: datas inválidas caem no padrão; um lado só usa o padrão no outro; período invertido é trocado.
 */
export function resolverPeriodoCivil(
  deRaw: string | undefined | null,
  ateRaw: string | undefined | null,
  hoje: string,
  padrao: Exclude<PresetPeriodoCivil, 'personalizado'> = 'mes',
): PeriodoCivilResolvido {
  const base = intervaloDoPreset(padrao, hoje)
  let de = ehDataCivil(deRaw) ? deRaw : base.de
  let ate = ehDataCivil(ateRaw) ? ateRaw : base.ate
  if (de > ate) [de, ate] = [ate, de]
  const preset = detectarPreset(de, ate, hoje)
  return { de, ate, preset, ehPadrao: de === base.de && ate === base.ate }
}

/**
 * Monta o href preservando os demais parâmetros. `periodo = null` remove o período (volta ao padrão).
 * Sempre zera a paginação (`pagina`/`page`), já que o conjunto muda.
 */
export function hrefComPeriodo(
  pathname: string,
  atual: URLSearchParams | string,
  periodo: PeriodoCivil | null,
): string {
  const p = new URLSearchParams(typeof atual === 'string' ? atual : atual.toString())
  p.delete('pagina')
  p.delete('page')
  if (periodo) {
    p.set('de', periodo.de)
    p.set('ate', periodo.ate)
  } else {
    p.delete('de')
    p.delete('ate')
  }
  const qs = p.toString()
  return qs ? `${pathname}?${qs}` : pathname
}
