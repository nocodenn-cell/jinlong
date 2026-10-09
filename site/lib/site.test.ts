import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getHomeContent } from './content'
import { CJK_WEIGHTS, cjkCharsByWeight } from './content/displayText'
import { getContactChannels, parseWechatId, parseWhatsappUrl } from './contactChannels'
import { isSiteLocale, otherSiteLocale, SITE_LOCALES } from './locales'
import {
  CLOSING_FIGURES,
  DEMO_PRODUCTS,
  HERO_SALE,
  closingTotalCents,
  saleItemCount,
  saleTotalCents,
} from './products'
import { isDraftChineseVisible, isLocaleDraft, isLocalePublic } from './publication'
import {
  WHOLESALE_EXAMPLE as EXAMPLE,
  clampQty,
  fillTemplate,
  isWholesale,
  markPercent,
  missingUnits,
  progressPercent,
  savingsCents,
  totalCents,
  unitCents,
} from './wholesale'

const CJK = /[㐀-鿿]/

function collectStrings(value: unknown, trail = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[trail, value]]
  if (Array.isArray(value)) return value.flatMap((item, index) => collectStrings(item, `${trail}[${index}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => collectStrings(item, trail ? `${trail}.${key}` : key))
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
  const optionalEmpty = new Set(['footer.ptOnly', 'draftBanner'])

  it('mesmas chaves nas duas línguas', () => {
    expect(zh.map(([key]) => key)).toEqual(pt.map(([key]) => key))
  })

  it('nenhum texto visível vazio, exceto campos opcionais por idioma', () => {
    expect([...pt, ...zh].filter(([key, value]) => value.trim() === '' && !optionalEmpty.has(key))).toEqual([])
  })

  it('o chinês só aparece em campos previstos na página em português', () => {
    const allowed =
      /^(hero\.signature|hero\.proof\[0\]|hero\.chipSecond\.text|langSwitch\.(group|zh|zhShort)|benefits\.items\[4\]\.what|languages\.title|languages\.zh\..*|footer\.zhTagline|brandLabel|footer\.tagline)$/
    const unexpected = pt.filter(([key, value]) => CJK.test(value) && !allowed.test(key))
    expect(unexpected).toEqual([])
  })

  it('a página em chinês é chinesa e o aviso de rascunho existe só nela', () => {
    const zhContent = getHomeContent('zh-CN')
    expect(CJK.test(zhContent.hero.h1.line1)).toBe(true)
    expect(CJK.test(zhContent.meta.description)).toBe(true)
    expect(getHomeContent('pt-BR').draftBanner).toBe('')
    expect(zhContent.draftBanner).not.toBe('')
  })

  it('termos de operação em chinês seguem o próprio ERP', () => {
    const zhContent = getHomeContent('zh-CN')
    expect(zhContent.pdv.finish).toBe('完成销售')
    expect(zhContent.screens.stock.colWholesale).toBe('批发价')
    expect(zhContent.screens.stock.colRetail).toBe('零售价')
    expect(zhContent.screens.close.cash).toBe('现金')
    expect(zhContent.screens.close.debit).toBe('借记卡')
    expect(zhContent.screens.close.credit).toBe('信用卡')
  })
})

describe('publicação do chinês', () => {
  it('produção só publica zh com revisão confirmada', () => {
    expect(isLocalePublic('zh-CN', { VERCEL_ENV: 'production' })).toBe(false)
    expect(isLocalePublic('zh-CN', { VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_ZH_REVIEWED: 'true' })).toBe(true)
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

  it('texto de marketing em chinês na página em português some em produção sem revisão', () => {
    expect(isDraftChineseVisible({ VERCEL_ENV: 'production' })).toBe(false)
    expect(isDraftChineseVisible({ VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_ZH_REVIEWED: 'true' })).toBe(true)
    expect(isDraftChineseVisible({ VERCEL_ENV: 'preview' })).toBe(true)
    expect(isDraftChineseVisible({})).toBe(true)
  })
})

describe('canais de contato', () => {
  const env = {
    NEXT_PUBLIC_SITE_WHATSAPP_URL: 'https://wa.me/550000000000',
    NEXT_PUBLIC_SITE_WECHAT_ID: 'ficticio_teste',
  }

  it('sem variáveis não há canais (nada embutido no código)', () => {
    expect(getContactChannels('pt-BR', {})).toEqual([])
  })

  it('ordena o canal principal conforme o idioma', () => {
    expect(getContactChannels('pt-BR', env)[0]?.id).toBe('whatsapp')
    expect(getContactChannels('zh-CN', env)[0]?.id).toBe('wechat')
  })

  it('rejeita URLs e IDs inválidos', () => {
    expect(parseWhatsappUrl('http://wa.me/550000000000')).toBeNull()
    expect(parseWhatsappUrl('https://evil.example/wa.me/550000000000')).toBeNull()
    expect(parseWhatsappUrl('javascript:alert(1)')).toBeNull()
    expect(parseWechatId('<script>')).toBeNull()
    expect(parseWechatId('ab')).toBeNull()
    expect(parseWechatId(undefined)).toBeNull()
  })
})

describe('simulação de atacado (ilustrativa, dados fictícios)', () => {
  it('atacado entra exatamente na quantidade do exemplo', () => {
    expect(isWholesale(EXAMPLE.minQty - 1)).toBe(false)
    expect(isWholesale(EXAMPLE.minQty)).toBe(true)
    expect(unitCents(EXAMPLE.minQty - 1)).toBe(EXAMPLE.retailCents)
    expect(unitCents(EXAMPLE.minQty)).toBe(EXAMPLE.wholesaleCents)
  })

  it('totais, economia e unidades que faltam batem com o mockup (6 un. = R$ 137,40)', () => {
    expect(totalCents(6)).toBe(13740)
    expect(missingUnits(6)).toBe(4)
    expect(missingUnits(10)).toBe(0)
    expect(savingsCents(10)).toBe(10 * (2290 - 1850))
    expect(savingsCents(9)).toBe(0)
  })

  it('limita a quantidade e posiciona a marca da faixa', () => {
    expect(clampQty(0)).toBe(1)
    expect(clampQty(500)).toBe(99)
    expect(clampQty(Number.NaN)).toBe(1)
    expect(progressPercent(99)).toBe(100)
    expect(Math.round(markPercent())).toBe(45)
  })

  it('preenche modelos de mensagem', () => {
    expect(fillTemplate('Faltam {n} unidades', { n: 4 })).toBe('Faltam 4 unidades')
    expect(fillTemplate('Economia de {valor}', { valor: 'R$ 1,00' })).toBe('Economia de R$ 1,00')
    expect(fillTemplate('sem {chave}', {})).toBe('sem {chave}')
  })
})

describe('dados fictícios das telas', () => {
  it('venda do hero: 15 itens e R$ 321,70', () => {
    expect(saleItemCount(HERO_SALE)).toBe(15)
    expect(saleTotalCents(HERO_SALE)).toBe(32170)
  })

  it('fechamento soma as formas de pagamento (sem a abertura)', () => {
    expect(closingTotalCents()).toBe(
      CLOSING_FIGURES.cashCents + CLOSING_FIGURES.pixCents + CLOSING_FIGURES.debitCents + CLOSING_FIGURES.creditCents
    )
    expect(closingTotalCents()).toBe(383300)
  })

  it('todo produto com atacado informa a faixa, e vice-versa', () => {
    for (const product of DEMO_PRODUCTS) {
      expect(product.wholesaleCents === null).toBe(product.wholesaleMin === null)
    }
  })
})

describe('fontes chinesas por papel', () => {
  const fontsDir = path.resolve(__dirname, '../app/fonts')

  it('arquivos de caracteres e subsets existem e cobrem o conteúdo atual (rode npm run fonts:subset)', () => {
    const expected = cjkCharsByWeight()
    for (const weight of CJK_WEIGHTS) {
      const recorded = fs.readFileSync(path.join(fontsDir, `cjk-${weight}.chars.txt`), 'utf8').trim()
      expect(recorded).toBe(expected[weight])
      expect(fs.statSync(path.join(fontsDir, `noto-sans-sc-${weight}-subset.woff2`)).size).toBeGreaterThan(1000)
    }
  })

  it('cada subset fica pequeno (orçamento de performance)', () => {
    for (const weight of CJK_WEIGHTS) {
      expect(fs.statSync(path.join(fontsDir, `noto-sans-sc-${weight}-subset.woff2`)).size).toBeLessThan(40 * 1024)
    }
  })

  it('licenças OFL acompanham as fontes', () => {
    for (const file of ['OFL-Geist.txt', 'OFL-NotoSansSC.txt']) {
      expect(fs.readFileSync(path.join(fontsDir, file), 'utf8')).toContain('SIL OPEN FONT LICENSE')
    }
  })
})
