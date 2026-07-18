import { describe, expect, it } from 'vitest'
import {
  getMessagesForLocaleInput,
  resolveAppMessage,
  tApp,
} from './catalogAdapter'

describe('catalogAdapter — login / locale (5.2c)', () => {
  it('login PT: pt → pt-BR e copy em português', () => {
    const bundle = getMessagesForLocaleInput('pt')
    expect(bundle.locale).toBe('pt-BR')
    expect(bundle.legacyIdioma).toBe('pt')
    expect(bundle.messages.login.entrar).toBe('Entrar')
    expect(tApp('pt', 'login.entrar')).toBe('Entrar')
  })

  it('login ZH: zh → zh-CN e copy em chinês', () => {
    const bundle = getMessagesForLocaleInput('zh')
    expect(bundle.locale).toBe('zh-CN')
    expect(bundle.legacyIdioma).toBe('zh')
    expect(bundle.messages.login.entrar).not.toBe('Entrar')
    expect(bundle.messages.login.entrar.length).toBeGreaterThan(0)
    expect(tApp('zh', 'login.entrar')).toBe(bundle.messages.login.entrar)
  })

  it('locale inválido → pt-BR / mensagens PT', () => {
    const bundle = getMessagesForLocaleInput('xx-YY')
    expect(bundle.locale).toBe('pt-BR')
    expect(bundle.messages.login.entrar).toBe('Entrar')
  })

  it('fallback en-US → pt-BR (sem catálogo EN)', () => {
    const bundle = getMessagesForLocaleInput('en-US')
    expect(bundle.locale).toBe('en-US')
    expect(bundle.legacyIdioma).toBe('pt')
    expect(bundle.messages.login.entrar).toBe('Entrar')

    const resolved = resolveAppMessage('en-US', 'login.entrar')
    expect(resolved.missing).toBe(false)
    expect(resolved.resolvedLocale).toBe('pt-BR')
    expect(resolved.value).toBe('Entrar')
  })

  it('cookie legado idioma_preferido zh-CN alias', () => {
    expect(getMessagesForLocaleInput('zh-CN').locale).toBe('zh-CN')
    expect(getMessagesForLocaleInput('pt-BR').locale).toBe('pt-BR')
  })
})
