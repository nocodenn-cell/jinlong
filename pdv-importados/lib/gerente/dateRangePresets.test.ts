import { describe, expect, it } from 'vitest'
import {
  computeDateRange,
  matchDateRangePreset,
  toLocalISODate,
} from './dateRangePresets'

// Quarta-feira, 4 de junho de 2026 (meio-dia local, longe da meia-noite).
const REF = new Date(2026, 5, 4, 12, 0, 0)

describe('computeDateRange', () => {
  it('hoje = data de referência', () => {
    expect(computeDateRange('hoje', REF)).toEqual({ de: '2026-06-04', ate: '2026-06-04' })
  })

  it('ontem = dia anterior, de=ate', () => {
    expect(computeDateRange('ontem', REF)).toEqual({ de: '2026-06-03', ate: '2026-06-03' })
  })

  it('7d = janela de 7 dias inclusiva (hoje − 6 … hoje)', () => {
    expect(computeDateRange('7d', REF)).toEqual({ de: '2026-05-29', ate: '2026-06-04' })
  })

  it('30d = janela de 30 dias inclusiva (hoje − 29 … hoje)', () => {
    expect(computeDateRange('30d', REF)).toEqual({ de: '2026-05-06', ate: '2026-06-04' })
  })

  it('esta_semana = segunda-feira da semana até hoje', () => {
    // 2026-06-04 é quinta; segunda da semana = 2026-06-01
    expect(computeDateRange('esta_semana', REF)).toEqual({ de: '2026-06-01', ate: '2026-06-04' })
  })

  it('mes_atual = primeiro dia do mês até hoje', () => {
    expect(computeDateRange('mes_atual', REF)).toEqual({ de: '2026-06-01', ate: '2026-06-04' })
  })

  it('mes_anterior = primeiro ao último dia do mês anterior', () => {
    expect(computeDateRange('mes_anterior', REF)).toEqual({ de: '2026-05-01', ate: '2026-05-31' })
  })

  it('mes_anterior cruza virada de ano (janeiro → dezembro)', () => {
    const jan = new Date(2026, 0, 15, 12)
    expect(computeDateRange('mes_anterior', jan)).toEqual({ de: '2025-12-01', ate: '2025-12-31' })
  })

  it('esta_semana quando hoje é segunda = só a segunda', () => {
    const seg = new Date(2026, 5, 1, 12) // 2026-06-01 é segunda
    expect(computeDateRange('esta_semana', seg)).toEqual({ de: '2026-06-01', ate: '2026-06-01' })
  })

  it('esta_semana quando hoje é domingo inclui a semana inteira', () => {
    const dom = new Date(2026, 5, 7, 12) // 2026-06-07 é domingo
    expect(computeDateRange('esta_semana', dom)).toEqual({ de: '2026-06-01', ate: '2026-06-07' })
  })
})

describe('toLocalISODate', () => {
  it('não desloca o dia perto da meia-noite (sem drift de UTC)', () => {
    // 23:30 local — toISOString() em UTC-3 viraria o dia seguinte.
    const tarde = new Date(2026, 5, 4, 23, 30, 0)
    expect(toLocalISODate(tarde)).toBe('2026-06-04')
  })
})

describe('matchDateRangePreset', () => {
  it('reconhece um intervalo de preset', () => {
    expect(matchDateRangePreset({ de: '2026-05-29', ate: '2026-06-04' }, REF)).toBe('7d')
  })

  it('retorna null para intervalo personalizado', () => {
    expect(matchDateRangePreset({ de: '2026-05-10', ate: '2026-05-22' }, REF)).toBeNull()
  })
})
