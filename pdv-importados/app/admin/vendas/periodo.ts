/**
 * Janelas de período da tela de Vendas, sempre no fuso de Brasília (UTC-3, sem
 * horário de verão desde 2019). O servidor roda em UTC, então `setHours(0,0,0,0)`
 * deslocava "Hoje"/"Ontem" em 3h (vendas da noite caíam no dia errado).
 */

export type Periodo = 'tudo' | 'hoje' | 'ontem' | '7d' | '30d' | 'mes'

export const PERIODOS: readonly Periodo[] = ['tudo', 'hoje', 'ontem', '7d', '30d', 'mes']

const BRT_OFFSET_H = 3

/** Meia-noite (BRT) de `now` + `diasOffset` dias, como instante UTC. */
function inicioDiaBrt(now: Date, diasOffset = 0): number {
  const brt = new Date(now.getTime() - BRT_OFFSET_H * 3_600_000)
  return Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate() + diasOffset, BRT_OFFSET_H)
}

export function periodoInicio(periodo: Periodo, now: Date = new Date()): string | null {
  switch (periodo) {
    case 'hoje':
      return new Date(inicioDiaBrt(now)).toISOString()
    case 'ontem':
      return new Date(inicioDiaBrt(now, -1)).toISOString()
    case '7d':
      return new Date(inicioDiaBrt(now, -6)).toISOString()
    case '30d':
      return new Date(inicioDiaBrt(now, -29)).toISOString()
    case 'mes': {
      const brt = new Date(now.getTime() - BRT_OFFSET_H * 3_600_000)
      return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), 1, BRT_OFFSET_H)).toISOString()
    }
    default:
      return null
  }
}

export function periodoFim(periodo: Periodo, now: Date = new Date()): string | null {
  if (periodo !== 'ontem') return null
  return new Date(inicioDiaBrt(now) - 1).toISOString()
}

/** Períodos que cobrem mais de um dia: a tabela precisa mostrar a data, não só a hora. */
export function periodoMultiDia(periodo: Periodo): boolean {
  return periodo === '7d' || periodo === '30d' || periodo === 'mes' || periodo === 'tudo'
}

