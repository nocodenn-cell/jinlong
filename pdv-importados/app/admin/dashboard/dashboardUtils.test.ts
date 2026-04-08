import { describe, expect, it } from 'vitest'
import {
  formatTrendPercent,
  getPeriodRange,
  normalizePeriod,
  normalizeStatus,
} from './dashboardUtils'

describe('dashboardUtils', () => {
  it('normaliza filtros de período e status com fallback seguro', () => {
    expect(normalizePeriod('TODAY')).toBe('TODAY')
    expect(normalizePeriod('30D')).toBe('30D')
    expect(normalizePeriod('INV')).toBe('7D')

    expect(normalizeStatus('CONCLUIDA')).toBe('CONCLUIDA')
    expect(normalizeStatus('CANCELADA')).toBe('CANCELADA')
    expect(normalizeStatus('anything')).toBe('ALL')
  })

  it('calcula range com período anterior correspondente', () => {
    const now = new Date('2026-04-07T15:30:00.000Z')
    const r = getPeriodRange('7D', now)

    expect(r.end.toISOString()).toBe('2026-04-07T15:30:00.000Z')
    expect(r.start.getHours()).toBe(0)
    expect(r.start.getMinutes()).toBe(0)
    expect(r.start.getSeconds()).toBe(0)
    expect(r.start.getMilliseconds()).toBe(0)
    expect(r.previousEnd.toISOString()).toBe(r.start.toISOString())
    expect(r.previousStart.getTime()).toBe(
      r.previousEnd.getTime() - (r.end.getTime() - r.start.getTime())
    )
  })

  it('formata tendência percentual com variações', () => {
    expect(formatTrendPercent(120, 100)).toEqual({ up: true, label: '+20.0%' })
    expect(formatTrendPercent(80, 100)).toEqual({ up: false, label: '-20.0%' })
    expect(formatTrendPercent(0, 0)).toEqual({ up: true, label: '0%' })
  })
})

