import { describe, expect, it } from 'vitest'
import {
  bridgeLegacyIdioma,
  resolveLocale,
  toLegacyIdioma,
} from './resolveLocale'
import { DEFAULT_LOCALE, FALLBACK_LOCALE } from './types'

describe('bridgeLegacyIdioma', () => {
  it('pt → pt-BR e zh → zh-CN', () => {
    expect(bridgeLegacyIdioma('pt')).toBe('pt-BR')
    expect(bridgeLegacyIdioma('zh')).toBe('zh-CN')
  })

  it('aceita aliases já BCP 47 e zh-HK', () => {
    expect(bridgeLegacyIdioma('pt-BR')).toBe('pt-BR')
    expect(bridgeLegacyIdioma('zh-CN')).toBe('zh-CN')
    expect(bridgeLegacyIdioma('zh-HK')).toBe('zh-CN')
  })

  it('desconhecido → default pt-BR', () => {
    expect(bridgeLegacyIdioma(undefined)).toBe(DEFAULT_LOCALE)
    expect(bridgeLegacyIdioma('fr')).toBe(DEFAULT_LOCALE)
  })
})

describe('resolveLocale', () => {
  it('resolve BCP 47 canônicos', () => {
    expect(resolveLocale('pt-BR')).toBe('pt-BR')
    expect(resolveLocale('zh-CN')).toBe('zh-CN')
    expect(resolveLocale('en-US')).toBe('en-US')
  })

  it('resolve legado e abreviações', () => {
    expect(resolveLocale('pt')).toBe('pt-BR')
    expect(resolveLocale('zh')).toBe('zh-CN')
    expect(resolveLocale('en')).toBe('en-US')
  })

  it('vazio / inválido → FALLBACK_LOCALE', () => {
    expect(resolveLocale(null)).toBe(FALLBACK_LOCALE)
    expect(resolveLocale('')).toBe(FALLBACK_LOCALE)
    expect(resolveLocale('   ')).toBe(FALLBACK_LOCALE)
    expect(resolveLocale('xx-YY')).toBe(FALLBACK_LOCALE)
  })
})

describe('toLegacyIdioma', () => {
  it('pt-BR → pt, zh-CN → zh', () => {
    expect(toLegacyIdioma('pt-BR')).toBe('pt')
    expect(toLegacyIdioma('zh-CN')).toBe('zh')
  })

  it('en-US → pt até haver catálogo legado EN', () => {
    expect(toLegacyIdioma('en-US')).toBe('pt')
  })
})
