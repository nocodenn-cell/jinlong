import { describe, it, expect } from 'vitest'
import { normalizeIdioma } from './normalizeIdioma'

describe('normalizeIdioma', () => {
  it('normaliza zh para zh', () => {
    expect(normalizeIdioma('zh')).toBe('zh')
  })

  it('normaliza zh-HK para zh-HK', () => {
    expect(normalizeIdioma('zh-HK')).toBe('zh-HK')
  })

  it('normaliza qualquer outro valor para pt', () => {
    expect(normalizeIdioma('pt')).toBe('pt')
    expect(normalizeIdioma(null)).toBe('pt')
    expect(normalizeIdioma(undefined)).toBe('pt')
    expect(normalizeIdioma('en')).toBe('pt')
    expect(normalizeIdioma('zh-hk')).toBe('zh-HK')
    expect(normalizeIdioma(123)).toBe('pt')
  })
})

