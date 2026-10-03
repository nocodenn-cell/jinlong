/**
 * Janelas de período da tela de Vendas, no FUSO DA LOJA (padrão America/Sao_Paulo). O servidor roda em UTC,
 * então `setHours(0,0,0,0)` deslocava "Hoje"/"Ontem" (vendas da noite caíam no dia errado).
 *
 * Reutiliza os helpers de dia civil de `lib/relatorios/periodoRelatorio` (mesma regra de Dashboard e Relatórios);
 * antes havia um offset fixo de 3h próprio desta tela.
 */
import {
  RELATORIO_TZ_PADRAO,
  inicioDoDiaCivilEmUtc,
  subtrairDiasCivis,
  ymdEmFuso,
} from '@/lib/relatorios/periodoRelatorio'

export type Periodo = 'tudo' | 'hoje' | 'ontem' | '7d' | '30d' | 'mes'

export const PERIODOS: readonly Periodo[] = ['tudo', 'hoje', 'ontem', '7d', '30d', 'mes']

/** Início (instante UTC) do dia civil `diasAtras` dias antes de hoje no fuso da loja. */
function inicioDiaCivil(now: Date, timeZone: string, diasAtras = 0): Date {
  return inicioDoDiaCivilEmUtc(subtrairDiasCivis(ymdEmFuso(now, timeZone), diasAtras), timeZone)
}

export function periodoInicio(
  periodo: Periodo,
  now: Date = new Date(),
  timeZone: string = RELATORIO_TZ_PADRAO,
): string | null {
  switch (periodo) {
    case 'hoje':
      return inicioDiaCivil(now, timeZone).toISOString()
    case 'ontem':
      return inicioDiaCivil(now, timeZone, 1).toISOString()
    case '7d':
      return inicioDiaCivil(now, timeZone, 6).toISOString()
    case '30d':
      return inicioDiaCivil(now, timeZone, 29).toISOString()
    case 'mes': {
      const primeiroDoMes = `${ymdEmFuso(now, timeZone).slice(0, 8)}01`
      return inicioDoDiaCivilEmUtc(primeiroDoMes, timeZone).toISOString()
    }
    default:
      return null
  }
}

export function periodoFim(
  periodo: Periodo,
  now: Date = new Date(),
  timeZone: string = RELATORIO_TZ_PADRAO,
): string | null {
  if (periodo !== 'ontem') return null
  return new Date(inicioDiaCivil(now, timeZone).getTime() - 1).toISOString()
}

/** Períodos que cobrem mais de um dia: a tabela precisa mostrar a data, não só a hora. */
export function periodoMultiDia(periodo: Periodo): boolean {
  return periodo === '7d' || periodo === '30d' || periodo === 'mes' || periodo === 'tudo'
}
