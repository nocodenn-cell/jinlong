import { describe, expect, it } from 'vitest'
import { fmtGerenteBRL, fmtGerenteDateTime, fmtGerenteIdCurto } from './gerenteValues'

describe('fmtGerenteBRL', () => {
  it('formats monetary value using BRL locale', () => {
    const result = fmtGerenteBRL(100, 'pt-BR')
    expect(result).toContain('100,00')
  })
})

describe('fmtGerenteDateTime', () => {
  it('returns dash for null', () => {
    expect(fmtGerenteDateTime(null, 'pt-BR')).toBe('—')
  })

  it('formats valid datetime string', () => {
    const result = fmtGerenteDateTime('2024-01-15T10:30:00Z', 'pt-BR')
    expect(result).not.toBe('—')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('fmtGerenteIdCurto', () => {
  it('returns dash for null', () => {
    expect(fmtGerenteIdCurto(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(fmtGerenteIdCurto(undefined)).toBe('—')
  })

  it('returns full string if shorter than len', () => {
    expect(fmtGerenteIdCurto('abc')).toBe('abc')
  })

  it('truncates long ids to default 8 chars with ellipsis', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const result = fmtGerenteIdCurto(uuid)
    expect(result).toBe('550e8400…')
  })

  it('respects custom length', () => {
    expect(fmtGerenteIdCurto('abcdefghij', 4)).toBe('abcd…')
  })
})
