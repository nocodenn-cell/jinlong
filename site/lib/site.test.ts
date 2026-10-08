import { describe, expect, it } from 'vitest'
import { getHomeContent, type HomeContent } from './content'
import { getContactChannels, parseWechatId, parseWhatsappUrl } from './contactChannels'
import { isSiteLocale, otherSiteLocale, SITE_LOCALES } from './locales'
import {
  ATACADO_MIN_QTY,
  PREVIEW_PRODUCTS,
  clampQty,
  initialQuantities,
  lineTotalCents,
  totalCents,
  unitPriceCents,
} from './pdvPreview'
import { isLocaleDraft, isLocalePublic } from './publication'

const CJK = /[一-鿿]/

function collectStrings(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]]
  if (Array.isArray(value)) return value.flatMap((v, i) => collectStrings(v, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => collectStrings(v, path ? `${path}.${k}` : k))
  }
  return []
}

describe('locales', () => {
  it('valida apenas pt-BR e zh-CN', () => {
    expect(SITE_LOCALES.every(isSiteLocale)).toBe(true)
    expect(isSiteLocale('en-US')).toBe(false)
    expect(isSiteLocale(undefined)).toBe(false)
    expect(otherSiteLocale('pt-BR')).toBe('zh-CN')
  })
})

describe('paridade de conteúdo pt-BR / zh-CN', () => {
  const pt = collectStrings(getHomeContent('pt-BR'))
  const zh = collectStrings(getHomeContent('zh-CN'))

  it('mesmas chaves nas duas línguas', () => {
    expect(zh.map(([k]) => k)).toEqual(pt.map(([k]) => k))
  })

  it('nenhum texto visível vazio, exceto campos opcionais por idioma', () => {
    const optional = new Set(['footer.ptOnly', 'locale.draftBanner'])
    const empty = [...pt, ...zh].filter(([k, v]) => v.trim() === '' && !optional.has(k))
    expect(empty).toEqual([])
  })

  it('zh contém caracteres chineses; pt não (exceto o rótulo do seletor e a nota 中文)', () => {
    const allowedPt = new Set(['locale.other', 'features.items[4].note'])
    expect(pt.filter(([k, v]) => CJK.test(v) && !allowedPt.has(k))).toEqual([])
    const zhContent: HomeContent = getHomeContent('zh-CN')
    expect(CJK.test(zhContent.hero.title)).toBe(true)
    expect(CJK.test(zhContent.meta.description)).toBe(true)
  })

  it('o aviso de rascunho existe apenas em zh', () => {
    expect(getHomeContent('pt-BR').locale.draftBanner).toBe('')
    expect(getHomeContent('zh-CN').locale.draftBanner).not.toBe('')
  })
})

describe('publicação do chinês', () => {
  it('produção só publica zh com revisão confirmada', () => {
    expect(isLocalePublic('zh-CN', { VERCEL_ENV: 'production' })).toBe(false)
    expect(
      isLocalePublic('zh-CN', { VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_ZH_REVIEWED: 'true' })
    ).toBe(true)
  })

  it('preview e dev mostram zh como rascunho', () => {
    expect(isLocalePublic('zh-CN', { VERCEL_ENV: 'preview' })).toBe(true)
    expect(isLocaleDraft('zh-CN', {})).toBe(true)
    expect(isLocaleDraft('zh-CN', { NEXT_PUBLIC_SITE_ZH_REVIEWED: 'true' })).toBe(false)
  })

  it('pt-BR é sempre público e nunca rascunho', () => {
    expect(isLocalePublic('pt-BR', { VERCEL_ENV: 'production' })).toBe(true)
    expect(isLocaleDraft('pt-BR', {})).toBe(false)
  })
})

describe('canais de contato', () => {
  const env = {
    NEXT_PUBLIC_SITE_WHATSAPP_URL: 'https://wa.me/5581900000000',
    NEXT_PUBLIC_SITE_WECHAT_ID: 'jinlong_demo',
  }

  it('sem variáveis não há canais (nada embutido no código)', () => {
    expect(getContactChannels('pt-BR', {})).toEqual([])
  })

  it('ordena o canal principal conforme o idioma', () => {
    expect(getContactChannels('pt-BR', env)[0]?.id).toBe('whatsapp')
    expect(getContactChannels('zh-CN', env)[0]?.id).toBe('wechat')
  })

  it('rejeita URLs e IDs inválidos', () => {
    expect(parseWhatsappUrl('http://wa.me/5581900000000')).toBeNull()
    expect(parseWhatsappUrl('https://evil.example/wa.me/5581900000000')).toBeNull()
    expect(parseWhatsappUrl('javascript:alert(1)')).toBeNull()
    expect(parseWechatId('<script>')).toBeNull()
    expect(parseWechatId('ab')).toBeNull()
    expect(parseWechatId(undefined)).toBeNull()
  })
})

describe('prévia do PDV (dados fictícios)', () => {
  const [fone] = PREVIEW_PRODUCTS

  it('atacado entra exatamente na quantidade mínima', () => {
    expect(unitPriceCents(fone, ATACADO_MIN_QTY - 1)).toBe(fone.varejoCents)
    expect(unitPriceCents(fone, ATACADO_MIN_QTY)).toBe(fone.atacadoCents)
  })

  it('soma linhas e limita quantidade', () => {
    expect(lineTotalCents(fone, 2)).toBe(fone.varejoCents * 2)
    expect(clampQty(-3)).toBe(0)
    expect(clampQty(500)).toBe(99)
    expect(clampQty(Number.NaN)).toBe(0)
    expect(totalCents(initialQuantities())).toBe(32420)
  })
})
