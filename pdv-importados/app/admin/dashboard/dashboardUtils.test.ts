import { describe, expect, it } from 'vitest'
import {
  agruparVendasPorDia,
  agruparVendasPorHora,
  dateKey,
  diasCivisDoPeriodo,
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

  describe('Onda B — dia civil e hora no fuso da loja', () => {
    const as2330 = '2026-09-30T02:30:00Z' // 29/09 23:30 BRT
    const as0010 = '2026-09-30T03:10:00Z' // 30/09 00:10 BRT

    it('dateKey usa o dia civil de Brasília, não UTC', () => {
      expect(dateKey(new Date(as2330))).toBe('2026-09-29')
      expect(dateKey(new Date(as0010))).toBe('2026-09-30')
      expect(dateKey(new Date(as2330), 'UTC')).toBe('2026-09-30')
    })

    it('venda às 23:30 BRT cai no dia da venda, e às 00:10 BRT no dia seguinte', () => {
      const { total, pedidos } = agruparVendasPorDia([
        { data: as2330, total_liquido: 100 },
        { data: as0010, total_liquido: 40 },
      ])
      expect(total.get('2026-09-29')).toBe(100)
      expect(total.get('2026-09-30')).toBe(40)
      expect(pedidos.get('2026-09-29')).toBe(1)
      expect(pedidos.get('2026-09-30')).toBe(1)
    })

    it('série horária usa a hora de Brasília (23h e 0h), não a do processo', () => {
      const horas = agruparVendasPorHora([
        { data: as2330, total_liquido: 100 },
        { data: as0010, total_liquido: 40 },
      ])
      expect(horas[23]).toBe(100)
      expect(horas[0]).toBe(40)
      expect(horas[2]).toBe(0)
      expect(horas[3]).toBe(0)
    })

    it('período diário: um dia civil; 7 dias: 7 chaves consecutivas, atravessando a virada de mês', () => {
      const hoje = getPeriodRange('TODAY', 'America/Sao_Paulo', new Date(as2330))
      expect(diasCivisDoPeriodo(hoje.start, hoje.end)).toEqual(['2026-09-29'])
      const sete = getPeriodRange('7D', 'America/Sao_Paulo', new Date('2026-10-02T15:00:00Z'))
      expect(diasCivisDoPeriodo(sete.start, sete.end)).toEqual([
        '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
      ])
    })

    it('todas as vendas agrupadas caem em algum dia do período (nada some na borda)', () => {
      const agora = new Date('2026-09-30T20:00:00Z')
      const { start, end } = getPeriodRange('7D', 'America/Sao_Paulo', agora)
      const rows = [
        { data: start.toISOString(), total_liquido: 1 }, // primeiro instante do período
        { data: new Date(start.getTime() + 86_400_000 - 1).toISOString(), total_liquido: 2 }, // último ms do 1º dia
        { data: end.toISOString(), total_liquido: 4 },
      ]
      const dias = diasCivisDoPeriodo(start, end)
      const { total } = agruparVendasPorDia(rows)
      const somaNosDias = dias.reduce((a, d) => a + (total.get(d) ?? 0), 0)
      expect(somaNosDias).toBe(7)
    })
  })
})
