import { describe, expect, it } from 'vitest'
import { truncarObservacaoCaixa } from './metaProdutoUi'

describe('truncarObservacaoCaixa', () => {
  it('returns empty string for null', () => {
    expect(truncarObservacaoCaixa(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(truncarObservacaoCaixa(undefined)).toBe('')
  })

  it('returns empty string for whitespace-only', () => {
    expect(truncarObservacaoCaixa('   ')).toBe('')
  })

  it('returns short text unchanged', () => {
    expect(truncarObservacaoCaixa('Nota curta')).toBe('Nota curta')
  })

  it('truncates text longer than default max (72) with ellipsis', () => {
    const long = 'A'.repeat(100)
    const result = truncarObservacaoCaixa(long)
    expect(result.length).toBe(72)
    expect(result.endsWith('…')).toBe(true)
  })

  it('respects custom max length', () => {
    const result = truncarObservacaoCaixa('Hello World', 5)
    expect(result).toBe('Hell…')
  })

  it('trims leading/trailing whitespace before checking length', () => {
    expect(truncarObservacaoCaixa('  ok  ')).toBe('ok')
  })
})
