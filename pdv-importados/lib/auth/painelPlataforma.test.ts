import { describe, expect, it } from 'vitest'
import { hubLoginUrl, parseHubUrl } from './painelPlataforma'

describe('parseHubUrl', () => {
  it('aceita origem https e http local', () => {
    expect(parseHubUrl('https://hub.exemplo.com/')).toBe('https://hub.exemplo.com')
    expect(parseHubUrl('http://localhost:3200')).toBe('http://localhost:3200')
  })

  it('recusa vazio, http remoto, caminho, query, hash e esquemas estranhos', () => {
    for (const raw of [
      undefined,
      '',
      'http://hub.exemplo.com',
      'https://hub.exemplo.com/login',
      'https://hub.exemplo.com/?x=1',
      'https://hub.exemplo.com/#a',
      'javascript:alert(1)',
      '//hub.exemplo.com',
    ]) {
      expect(parseHubUrl(raw)).toBeNull()
    }
  })
})

describe('hubLoginUrl', () => {
  it('monta o login do hub com a origem', () => {
    expect(hubLoginUrl('https://hub.exemplo.com')).toBe('https://hub.exemplo.com/login?origem=jinlong')
  })

  it('inerte sem configuração válida', () => {
    expect(hubLoginUrl(undefined)).toBeNull()
    expect(hubLoginUrl('http://evil.com')).toBeNull()
  })
})
