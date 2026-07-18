import { describe, expect, it } from 'vitest'
import { formatMoney } from './money'
import { formatNumber } from './number'
import { formatDate, formatDateTime } from './date'

describe('formatMoney', () => {
  it('formata BRL em pt-BR', () => {
    const out = formatMoney(1234.5, { locale: 'pt-BR' })
    expect(out).toMatch(/1.?234/)
    expect(out).toMatch(/50/)
  })

  it('aceita locale zh-CN com currency BRL', () => {
    const out = formatMoney(10, { locale: 'zh-CN', currency: 'BRL' })
    expect(out.length).toBeGreaterThan(0)
    expect(out).toMatch(/10/)
  })

  it('NaN → 0 seguro', () => {
    expect(formatMoney(Number.NaN, { locale: 'pt-BR' })).toMatch(/0/)
  })
})

describe('formatNumber', () => {
  it('respeita fraction digits em pt-BR', () => {
    expect(
      formatNumber(25.9, {
        locale: 'pt-BR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ).toBe('25,90')
  })

  it('en-US usa ponto decimal', () => {
    expect(
      formatNumber(25.9, {
        locale: 'en-US',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ).toBe('25.90')
  })
})

describe('formatDateTime / formatDate', () => {
  const fixed = new Date('2026-07-18T15:00:00.000Z')

  it('formatDateTime retorna string não vazia', () => {
    const out = formatDateTime(fixed, {
      locale: 'pt-BR',
      timeZone: 'America/Sao_Paulo',
    })
    expect(out.length).toBeGreaterThan(0)
  })

  it('formatDate inválido → string vazia', () => {
    expect(formatDate('not-a-date', { locale: 'pt-BR' })).toBe('')
  })

  it('en-US produz output distinto de estilo (smoke)', () => {
    const pt = formatDate(fixed, { locale: 'pt-BR', timeZone: 'UTC' })
    const en = formatDate(fixed, { locale: 'en-US', timeZone: 'UTC' })
    expect(pt.length).toBeGreaterThan(0)
    expect(en.length).toBeGreaterThan(0)
  })
})
