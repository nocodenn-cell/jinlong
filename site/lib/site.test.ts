import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getHomeContent } from './content'
import { CJK_WEIGHTS, cjkCharsByWeight } from './content/displayText'
import { SEGMENT_VALUES } from './leadSchema'
import { CONTACT_EMAIL, getContactChannels, parseWhatsappUrl } from './contactChannels'
import { isSiteLocale, otherSiteLocale, SITE_LOCALES } from './locales'
import {
  CLOSING_FIGURES,
  DEMO_PRODUCTS,
  HERO_SALE,
  OVERVIEW_FIGURES,
  TOP_SELLERS,
  averageTicketCents,
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
  const optionalEmpty = new Set(['footer.ptOnly'])

  it('mesmas chaves nas duas línguas', () => {
    expect(zh.map(([key]) => key)).toEqual(pt.map(([key]) => key))
  })

  it('nenhum texto visível vazio, exceto campos opcionais por idioma', () => {
    expect([...pt, ...zh].filter(([key, value]) => value.trim() === '' && !optionalEmpty.has(key))).toEqual([])
  })

  it('o chinês só aparece em campos previstos na página em português', () => {
    const allowed =
      /^(langSwitch\.(group|zh|zhShort)|statement\.railZh\[\d\]|difference\.artZh|final\.lines\[0\]|footer\.zhTagline|brandLabel|meta\.title|hero\.bottom\[0\])$/
    const unexpected = pt.filter(([key, value]) => CJK.test(value) && !allowed.test(key))
    expect(unexpected).toEqual([])
  })

  it('abertura aprovada e página chinesa em chinês', () => {
    const ptHero = getHomeContent('pt-BR').hero
    expect(Object.values(ptHero.h1).join(' ')).toBe('Sua loja. Seu ritmo. Seu controle.')
    expect(ptHero.lead).toBe('Uma operação conectada do balcão à gestão. Varejo, atacado e estoque no mesmo sistema — em português e chinês.')
    expect([ptHero.ctaPrimary, ptHero.ctaSecondary]).toEqual(['Conhecer o Jinlong', 'Explorar a experiência'])
    const zhContent = getHomeContent('zh-CN')
    expect(CJK.test(zhContent.hero.h1.line1)).toBe(true)
    expect(CJK.test(zhContent.meta.description)).toBe(true)
    for (const locale of ['pt-BR', 'zh-CN'] as const) {
      const content = getHomeContent(locale)
      expect(Object.keys(content.commandCenter.scenes)).toEqual(['overview', 'pos', 'stock', 'wholesale', 'reports'])
      expect(content.process.steps).toHaveLength(3)
      expect(content.statement.problems).toHaveLength(3)
      expect(content.form.segments.map((s) => s.value)).toEqual([...SEGMENT_VALUES])
    }
  })

  it('direção comercial: demonstração, sem teste grátis, sem promessa fiscal nem superlativos', () => {
    for (const locale of ['pt-BR', 'zh-CN'] as const) {
      const content = getHomeContent(locale)
      const all = collectStrings(content).map(([, v]) => v).join('\n')
      expect(all).not.toMatch(/grátis|gratis|免费|试用|15 dias|15天|\[|em breve|即将/i)
      expect(all).not.toMatch(/CONFIRMAR|TODO|DEPOIMENTO|PREÇO\]|R\$ ?149|R\$ ?299/)
      expect(all).not.toMatch(/melhor (ERP|sistema)|n[ºo] ?1|aumente (seu|o) faturamento|最好的|第一/i)
      const prominent = JSON.stringify([content.hero, content.statement, content.commandCenter, content.difference, content.final])
      expect(prominent).not.toMatch(/NFC-e|NF-e|nota fiscal|发票/i)
      const fiscal = content.faq.items.find((item) => /NFC-e/.test(item.q))
      expect(fiscal?.a).not.toMatch(/emite|homologad|已开通|支持开具/i)
      expect(content.commandCenter.illustrative).toMatch(/fictícios|虚构/)
    }
    expect(getHomeContent('pt-BR').form.submit).toBe('Agendar demonstração')
    expect(getHomeContent('zh-CN').form.submit).toBe('预约演示')
  })

  it('termos de operação em chinês seguem o próprio ERP', () => {
    const cc = getHomeContent('zh-CN').commandCenter
    expect(cc.pos.finish).toBe('完成销售')
    expect(cc.stock.wholesale).toBe('批发价')
    expect(cc.stock.retail).toBe('零售价')
    expect(cc.reports.cash).toBe('现金')
    expect(cc.reports.debit).toBe('借记卡')
    expect(cc.reports.credit).toBe('信用卡')
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
  const env = { NEXT_PUBLIC_SITE_WHATSAPP_URL: 'https://wa.me/550000000000' }

  it('sem variáveis só há o e-mail oficial (mailto)', () => {
    const channels = getContactChannels('pt-BR', {})
    expect(channels.map((c) => c.id)).toEqual(['email'])
    expect(channels[0]).toMatchObject({ address: CONTACT_EMAIL })
    expect(channels[0]?.href.startsWith(`mailto:${CONTACT_EMAIL}?subject=`)).toBe(true)
  })

  it('WhatsApp configurado vem primeiro; e-mail continua; WeChat não é canal', () => {
    for (const locale of ['pt-BR', 'zh-CN'] as const) {
      const ids = getContactChannels(locale, { ...env, NEXT_PUBLIC_SITE_WECHAT_ID: 'ficticio_teste' }).map((c) => c.id)
      expect(ids).toEqual(['whatsapp', 'email'])
    }
  })

  it('rejeita URLs e IDs inválidos', () => {
    expect(parseWhatsappUrl('http://wa.me/550000000000')).toBeNull()
    expect(parseWhatsappUrl('https://evil.example/wa.me/550000000000')).toBeNull()
    expect(parseWhatsappUrl('javascript:alert(1)')).toBeNull()
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

describe('dados fictícios do centro de comando', () => {
  it('venda do caixa: 15 itens e R$ 321,70', () => {
    expect(saleItemCount(HERO_SALE)).toBe(15)
    expect(saleTotalCents(HERO_SALE)).toBe(32170)
  })

  it('fechamento soma as formas de pagamento (sem a abertura)', () => {
    expect(closingTotalCents()).toBe(
      CLOSING_FIGURES.cashCents + CLOSING_FIGURES.pixCents + CLOSING_FIGURES.debitCents + CLOSING_FIGURES.creditCents
    )
    expect(closingTotalCents()).toBe(383300)
  })

  it('visão geral: ticket médio derivado das vendas, mais vendidos existem no catálogo', () => {
    expect(averageTicketCents()).toBe(Math.round(OVERVIEW_FIGURES.salesCents / OVERVIEW_FIGURES.salesCount))
    for (const item of TOP_SELLERS) expect(DEMO_PRODUCTS.some((p) => p.id === item.productId)).toBe(true)
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
