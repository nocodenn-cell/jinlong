import { describe, expect, it } from 'vitest'
import { periodoFim, periodoInicio, periodoMultiDia } from './periodo'

// 29/09/2026 23:30 em Brasília = 30/09/2026 02:30Z
const NOITE = new Date('2026-09-30T02:30:00Z')

describe('periodo (fuso BRT)', () => {
  it('hoje começa à meia-noite de Brasília, mesmo com o servidor já em outro dia UTC', () => {
    expect(periodoInicio('hoje', NOITE)).toBe('2026-09-29T03:00:00.000Z')
  })
  it('ontem fecha 1ms antes do início de hoje', () => {
    expect(periodoInicio('ontem', NOITE)).toBe('2026-09-28T03:00:00.000Z')
    expect(periodoFim('ontem', NOITE)).toBe('2026-09-29T02:59:59.999Z')
  })
  it('7d e 30d incluem hoje (janela de 7/30 dias corridos)', () => {
    expect(periodoInicio('7d', NOITE)).toBe('2026-09-23T03:00:00.000Z')
    expect(periodoInicio('30d', NOITE)).toBe('2026-08-31T03:00:00.000Z')
  })
  it('mes começa no dia 1 (BRT)', () => {
    expect(periodoInicio('mes', NOITE)).toBe('2026-09-01T03:00:00.000Z')
  })
  it('tudo não tem limites', () => {
    expect(periodoInicio('tudo', NOITE)).toBeNull()
    expect(periodoFim('tudo', NOITE)).toBeNull()
  })
  it('multi-dia', () => {
    expect(periodoMultiDia('hoje')).toBe(false)
    expect(periodoMultiDia('30d')).toBe(true)
  })

  it('Onda B: 23:30 BRT ainda é o mesmo dia civil; 00:10 BRT já é o dia seguinte', () => {
    const as2330 = new Date('2026-09-30T02:30:00Z') // 29/09 23:30 BRT
    const as0010 = new Date('2026-09-30T03:10:00Z') // 30/09 00:10 BRT
    expect(periodoInicio('hoje', as2330)).toBe('2026-09-29T03:00:00.000Z')
    expect(periodoInicio('hoje', as0010)).toBe('2026-09-30T03:00:00.000Z')
  })

  it('Onda B: a virada de meia-noite BRT (02:59:59Z → 03:00:00Z) troca o dia', () => {
    expect(periodoInicio('hoje', new Date('2026-09-30T02:59:59.999Z'))).toBe('2026-09-29T03:00:00.000Z')
    expect(periodoInicio('hoje', new Date('2026-09-30T03:00:00.000Z'))).toBe('2026-09-30T03:00:00.000Z')
  })

  it('Onda B: "ontem" é um dia civil inteiro (24h) terminando 1ms antes de hoje', () => {
    const agora = new Date('2026-09-30T15:00:00Z')
    const ini = new Date(periodoInicio('ontem', agora)!).getTime()
    const fim = new Date(periodoFim('ontem', agora)!).getTime()
    expect(fim - ini).toBe(24 * 3_600_000 - 1)
    expect(periodoInicio('ontem', agora)).toBe('2026-09-29T03:00:00.000Z')
  })

  it('Onda B: "mes" vira no primeiro dia do mês em BRT (00:10 de 1º/out já é outubro)', () => {
    expect(periodoInicio('mes', new Date('2026-10-01T02:30:00Z'))).toBe('2026-09-01T03:00:00.000Z') // 30/09 23:30 BRT
    expect(periodoInicio('mes', new Date('2026-10-01T03:10:00Z'))).toBe('2026-10-01T03:00:00.000Z') // 01/10 00:10 BRT
  })

  it('Onda B: usa o fuso informado (não um offset fixo de 3h)', () => {
    const agora = new Date('2026-09-30T02:30:00Z')
    expect(periodoInicio('hoje', agora, 'UTC')).toBe('2026-09-30T00:00:00.000Z')
    expect(periodoInicio('hoje', agora, 'America/Sao_Paulo')).toBe('2026-09-29T03:00:00.000Z')
  })

  it('Onda B: é a mesma janela do Dashboard (getPeriodRange) para hoje, 7d e 30d', async () => {
    const { getPeriodRange } = await import('@/app/admin/dashboard/dashboardUtils')
    for (const agora of [
      new Date('2026-09-30T02:30:00Z'),
      new Date('2026-09-30T03:10:00Z'),
      new Date('2026-09-30T20:00:00Z'),
    ]) {
      expect(periodoInicio('hoje', agora)).toBe(getPeriodRange('TODAY', 'America/Sao_Paulo', agora).start.toISOString())
      expect(periodoInicio('7d', agora)).toBe(getPeriodRange('7D', 'America/Sao_Paulo', agora).start.toISOString())
      expect(periodoInicio('30d', agora)).toBe(getPeriodRange('30D', 'America/Sao_Paulo', agora).start.toISOString())
    }
  })
})
