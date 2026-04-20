import { describe, expect, it } from 'vitest'
import { htmlLangFromIdioma } from './htmlLang'

describe('htmlLangFromIdioma', () => {
  it.each([
    ['pt', 'pt-BR'],
    ['zh', 'zh-CN'],
    ['zh-HK', 'zh-HK'],
  ] as const)('mapeia %s → %s', (idioma, esperado) => {
    expect(htmlLangFromIdioma(idioma)).toBe(esperado)
  })
})
