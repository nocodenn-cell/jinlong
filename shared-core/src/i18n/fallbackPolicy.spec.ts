import { describe, expect, it } from 'vitest'
import { fallbackLocaleChain, resolveMessage } from './fallbackPolicy'
import type { CatalogMap } from './types'

const catalogs: CatalogMap = {
  'pt-BR': {
    clientes: { titulo: 'Clientes', sub: 'Cadastro' },
    comum: { ok: 'OK' },
  },
  'zh-CN': {
    clientes: { titulo: '客户' },
  },
  // en-US ausente de propósito — herda pt-BR
}

describe('fallbackLocaleChain', () => {
  it('pt-BR só tenta a si', () => {
    expect(fallbackLocaleChain('pt-BR')).toEqual(['pt-BR'])
  })

  it('zh-CN e en-US caem para pt-BR', () => {
    expect(fallbackLocaleChain('zh-CN')).toEqual(['zh-CN', 'pt-BR'])
    expect(fallbackLocaleChain('en-US')).toEqual(['en-US', 'pt-BR'])
  })
})

describe('resolveMessage', () => {
  it('resolve no locale pedido', () => {
    expect(resolveMessage({ catalogs, locale: 'zh-CN', key: 'clientes.titulo' })).toEqual({
      value: '客户',
      resolvedLocale: 'zh-CN',
      missing: false,
    })
  })

  it('en-US sem catálogo → fallback pt-BR', () => {
    expect(resolveMessage({ catalogs, locale: 'en-US', key: 'comum.ok' })).toEqual({
      value: 'OK',
      resolvedLocale: 'pt-BR',
      missing: false,
    })
  })

  it('zh-CN missing key parcial → fallback pt-BR', () => {
    expect(resolveMessage({ catalogs, locale: 'zh-CN', key: 'clientes.sub' })).toEqual({
      value: 'Cadastro',
      resolvedLocale: 'pt-BR',
      missing: false,
    })
  })

  it('ausente em todos → devolve a key', () => {
    expect(resolveMessage({ catalogs, locale: 'pt-BR', key: 'nao.existe' })).toEqual({
      value: 'nao.existe',
      resolvedLocale: 'pt-BR',
      missing: true,
    })
  })
})
