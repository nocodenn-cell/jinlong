/**
 * Contrato único de conteúdo da home (direção D — Tecnologia com Identidade).
 * pt-BR e zh-CN implementam a mesma forma; textos em chinês são rascunho até a revisão nativa.
 */

export interface TextWithLang {
  text: string
  lang: 'pt-BR' | 'zh-CN'
}

export interface BenefitItem {
  title: string
  body: string
  what: string
}

export interface StepItem {
  title: string
  body: string
}

export interface PdvWindowCopy {
  top: string
  sample: string
  colProduct: string
  colQty: string
  colSubtotal: string
  wholesaleBadge: string
  total: string
  finish: string
  aria: string
}

export interface ScreensCopy {
  eyebrow: string
  title: string
  lead: string
  represent: string
  stock: {
    bar: string
    colProduct: string
    colRetail: string
    colWholesale: string
    colStock: string
    captionTitle: string
    captionBody: string
  }
  close: {
    bar: string
    opening: string
    cash: string
    pix: string
    debit: string
    credit: string
    total: string
    captionTitle: string
    captionBody: string
  }
  panel: {
    bar: string
    kpiSales: string
    kpiItems: string
    kpiCritical: string
    captionTitle: string
    captionBody: string
  }
}

export interface WholesaleCopy {
  eyebrow: string
  title: string
  lead: string
  hint: string
  product: string
  tag: string
  retailRule: string
  wholesaleRule: string
  decrease: string
  increase: string
  quantity: string
  unitRetail: string
  unitWholesale: string
  missingOne: string
  missingMany: string
  applied: string
  disclaimer: string
}

export interface LanguageSample {
  code: string
  name: string
  title: string
  rows: ReadonlyArray<readonly [string, string]>
  total: readonly [string, string]
  button: string
}

export interface LanguagesCopy {
  eyebrow: string
  title: string
  lead: string
  pt: LanguageSample
  zh: LanguageSample
}

export interface ContactCopy {
  whatsapp: string
  wechat: string
  wechatIdLabel: string
  opensNewTab: string
}

export interface HomeContent {
  meta: { title: string; description: string }
  skipLink: string
  brandLabel: string
  nav: {
    label: string
    home: string
    features: string
    demo: string
    how: string
    contact: string
    login: string
    menuOpen: string
    menuClose: string
  }
  langSwitch: { group: string; pt: string; ptShort: string; zh: string; zhShort: string }
  hero: {
    signature: string
    h1: { line1: string; line2: string; emphasis: string; rest: string }
    lead: string
    ctaDemo: string
    ctaTrial: string
    trialNote: string
    proof: readonly [string, string, string]
    chipFirst: TextWithLang
    chipSecond: TextWithLang
    floatTitle: string
    floatNote: string
  }
  pdv: PdvWindowCopy
  benefits: { eyebrow: string; title: string; items: readonly BenefitItem[] }
  screens: ScreensCopy
  wholesale: WholesaleCopy
  languages: LanguagesCopy
  steps: { eyebrow: string; title: string; items: readonly StepItem[] }
  final: { title: string; lead: string }
  contact: ContactCopy
  footer: {
    tagline: string
    zhTagline: string
    contactTitle: string
    legalTitle: string
    privacy: string
    terms: string
    login: string
    ptOnly: string
  }
  draftBanner: string
}
