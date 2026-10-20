/**
 * Contrato único de conteúdo da home (layout unificado com o Venddi; marca Jinlong).
 * pt-BR e zh-CN implementam a mesma forma; textos em chinês são rascunho até a revisão nativa.
 */

export interface TitledItem {
  title: string
  body: string
}

export interface MockItem {
  name: string
  sku: string
  price: string
}

export interface StatCard {
  label: string
  value: string
  note: string
}

export interface TopProduct {
  name: string
  sales: string
  total: string
}

export interface ContactCopy {
  whatsapp: string
  wechat: string
  wechatIdLabel: string
  opensNewTab: string
  soon: string
}

export interface HomeContent {
  meta: { title: string; description: string }
  skipLink: string
  brandLabel: string
  nav: {
    label: string
    benefits: string
    how: string
    panel: string
    login: string
    cta: string
    menuOpen: string
    menuClose: string
  }
  langSwitch: { group: string; pt: string; ptShort: string; zh: string; zhShort: string }
  hero: {
    badge: string
    h1: { line1: string; line2: string }
    lead: string
    ctaPrimary: string
    ctaSecondary: string
    microcopy: string
  }
  mock: { items: readonly MockItem[]; totalLabel: string; total: string; finish: string; aria: string }
  benefits: { title: string; subtitle: string; items: readonly TitledItem[] }
  steps: { title: string; subtitle: string; items: readonly TitledItem[] }
  panel: {
    title: string
    subtitle: string
    sample: string
    stats: readonly [StatCard, StatCard, StatCard]
    topTitle: string
    top: readonly TopProduct[]
  }
  final: { title: string; lead: string; cta: string; checks: readonly [string, string, string] }
  contact: ContactCopy
  footer: {
    tagline: string
    productTitle: string
    companyTitle: string
    legalTitle: string
    privacy: string
    terms: string
    login: string
    ptOnly: string
    rights: string
  }
  draftBanner: string
}
