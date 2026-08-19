import { describe, expect, it } from 'vitest'
import {
  RELATORIO_MAX_DIAS_INCLUSIVOS,
  diasNoIntervaloInclusive,
  inicioDoDiaCivilEmUtc,
  isYmd,
  resolverPeriodoRelatorio,
  subtrairDiasCivis,
  ymdEmFuso,
} from './periodoRelatorio'

describe('periodoRelatorio', () => {
  it('isYmd rejeita data inexistente', () => {
    expect(isYmd('2026-02-30')).toBe(false)
    expect(isYmd('2026-01-15')).toBe(true)
  })

  it('subtrairDiasCivis atravessa mês', () => {
    expect(subtrairDiasCivis('2026-03-15', 20)).toBe('2026-02-23')
  })

  it('resolverPeriodoRelatorio usa 30 dias civis inclusivos sem query', () => {
    const r = resolverPeriodoRelatorio()
    expect(r.aviso).toBe('nenhum')
    expect(diasNoIntervaloInclusive(r.de, r.ate)).toBe(30)
  })

  it('inverte quando de > ate', () => {
    const r = resolverPeriodoRelatorio('2026-03-10', '2026-03-01')
    expect(r.de).toBe('2026-03-01')
    expect(r.ate).toBe('2026-03-10')
    expect(r.aviso).toBe('periodo_invertido')
  })

  it('limita a 366 dias mantendo ate', () => {
    const r = resolverPeriodoRelatorio('2020-01-01', '2026-01-01')
    expect(r.ate).toBe('2026-01-01')
    expect(diasNoIntervaloInclusive(r.de, r.ate)).toBe(RELATORIO_MAX_DIAS_INCLUSIVOS)
    expect(r.aviso).toBe('periodo_limitado')
  })

  it('inicioDoDiaCivilEmUtc ancora meia-noite de São Paulo (UTC-3), não meia-noite UTC', () => {
    expect(inicioDoDiaCivilEmUtc('2026-04-07', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-04-07T03:00:00.000Z',
    )
    expect(inicioDoDiaCivilEmUtc('2026-04-07', 'UTC').toISOString()).toBe(
      '2026-04-07T00:00:00.000Z',
    )
  })

  it('ymdEmFuso: mesmo instante cai em dias civis diferentes conforme o fuso', () => {
    const instante = new Date('2026-04-07T02:00:00.000Z') // 23:00 de 06/04 em São Paulo
    expect(ymdEmFuso(instante, 'America/Sao_Paulo')).toBe('2026-04-06')
    expect(ymdEmFuso(instante, 'UTC')).toBe('2026-04-07')
  })
})
