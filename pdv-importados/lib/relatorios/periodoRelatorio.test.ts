import { describe, expect, it } from 'vitest'
import {
  RELATORIO_MAX_DIAS_INCLUSIVOS,
  diasAteVencimento,
  formatarDataCivilNumerica,
  horaEmFuso,
  ymdEmFuso,
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

describe('Onda B — dia civil, hora e vencimento (data civil)', () => {
  it('ymdEmFuso: 23:30 BRT e 00:10 BRT', () => {
    expect(ymdEmFuso(new Date('2026-09-30T02:30:00Z'))).toBe('2026-09-29')
    expect(ymdEmFuso(new Date('2026-09-30T03:10:00Z'))).toBe('2026-09-30')
  })

  it('horaEmFuso devolve a hora do fuso, com 0 para meia-noite (h23)', () => {
    expect(horaEmFuso(new Date('2026-09-30T02:30:00Z'))).toBe(23)
    expect(horaEmFuso(new Date('2026-09-30T03:10:00Z'))).toBe(0)
    expect(horaEmFuso(new Date('2026-09-30T15:00:00Z'), 'UTC')).toBe(15)
  })

  it('vencimento é data civil: 05/09 continua 05/09 (nunca 04/09) e sem hora', () => {
    expect(formatarDataCivilNumerica('2026-09-05', 'pt-BR')).toBe('05/09/2026')
    expect(formatarDataCivilNumerica('2026-09-05T00:00:00+00:00', 'pt-BR')).toBe('05/09/2026')
    expect(formatarDataCivilNumerica('2026-09-05', 'pt-BR')).not.toMatch(/\d{2}:\d{2}/)
    expect(formatarDataCivilNumerica(null, 'pt-BR')).toBe('—')
    expect(formatarDataCivilNumerica('lixo', 'pt-BR')).toBe('—')
  })

  it('diasAteVencimento conta dias civis (hoje = 0, ontem = -1, amanhã = 1)', () => {
    expect(diasAteVencimento('2026-09-05', '2026-09-05')).toBe(0)
    expect(diasAteVencimento('2026-09-04', '2026-09-05')).toBe(-1)
    expect(diasAteVencimento('2026-09-06', '2026-09-05')).toBe(1)
    expect(diasAteVencimento('2026-10-01', '2026-09-30')).toBe(1) // virada de mês
  })

  it('vencimento "hoje" às 23:30 BRT dá 0 dias (não depende do relógio UTC)', () => {
    const hoje = ymdEmFuso(new Date('2026-09-05T02:30:00Z')) // 04/09 23:30 BRT
    expect(diasAteVencimento('2026-09-04', hoje)).toBe(0)
  })
})
