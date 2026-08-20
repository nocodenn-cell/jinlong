import { describe, expect, it } from 'vitest'
import {
  formatTrendPercent,
  getPeriodRange,
  normalizePeriod,
  normalizeStatus,
  shortOrderId,
} from './dashboardUtils'

describe('dashboardUtils', () => {
  it('normaliza filtros de período e status com fallback seguro', () => {
    expect(normalizePeriod('TODAY')).toBe('TODAY')
    expect(normalizePeriod('7D')).toBe('7D')
    expect(normalizePeriod('30D')).toBe('30D')
    expect(normalizePeriod(undefined)).toBe('TODAY')
    expect(normalizePeriod('INV')).toBe('TODAY')

    expect(normalizeStatus('CONCLUIDA')).toBe('CONCLUIDA')
    expect(normalizeStatus('CANCELADA')).toBe('CANCELADA')
    expect(normalizeStatus('anything')).toBe('ALL')
  })

  it('calcula range com período anterior correspondente, em fuso fixo (não o do runner)', () => {
    const now = new Date('2026-04-07T15:30:00.000Z')
    const r = getPeriodRange('7D', 'America/Sao_Paulo', now)

    expect(r.end.toISOString()).toBe('2026-04-07T15:30:00.000Z')
    // Início do dia civil 6 dias atrás (01/04) às 00:00 em America/Sao_Paulo (UTC-3) = 03:00Z.
    expect(r.start.toISOString()).toBe('2026-04-01T03:00:00.000Z')
    expect(r.previousEnd.toISOString()).toBe(r.start.toISOString())
    expect(r.previousStart.getTime()).toBe(
      r.previousEnd.getTime() - (r.end.getTime() - r.start.getTime())
    )
  })

  it('início do dia civil independe do fuso do processo rodando o teste', () => {
    // TODAY em 2026-04-07T02:00:00.000Z (23:00 do dia 06 em São Paulo) deve
    // ancorar no dia civil 06, não 07 — só acontece se o cálculo usar o fuso
    // do relatório, não `new Date().setHours(0,0,0,0)` (hora local do processo).
    const now = new Date('2026-04-07T02:00:00.000Z')
    const r = getPeriodRange('TODAY', 'America/Sao_Paulo', now)
    expect(r.start.toISOString()).toBe('2026-04-06T03:00:00.000Z')
  })

  it('formata tendência percentual com variações', () => {
    expect(formatTrendPercent(120, 100)).toEqual({ up: true, label: '+20.0%' })
    expect(formatTrendPercent(80, 100)).toEqual({ up: false, label: '-20.0%' })
    expect(formatTrendPercent(50, 0, { newLabel: 'novo', flatLabel: '—' })).toEqual({
      up: true,
      label: 'novo',
      neutral: true,
    })
    expect(formatTrendPercent(0, 0, { newLabel: 'novo', flatLabel: '—' })).toEqual({
      up: true,
      label: '—',
      neutral: true,
    })
  })

  it('encurta id de pedido preservando prefixo', () => {
    expect(shortOrderId('abc')).toBe('abc')
    expect(shortOrderId('12345678-90ab-cdef')).toBe('12345678…')
  })
})
