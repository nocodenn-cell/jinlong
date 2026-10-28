/**
 * Contrato único de conteúdo da home (Premium 2.0 — grafite, dourado e vermelho institucional).
 * pt-BR e zh-CN implementam a mesma forma; textos em chinês são rascunho até a revisão nativa.
 */

export interface TitledPlain {
  title: string
  body: string
}

export interface FaqItem {
  q: string
  a: string
}

export interface SegmentOption {
  value: string
  label: string
}

/** Uma cena do centro de comando (representação ilustrativa, dados fictícios). */
export interface SceneCopy {
  tab: string
  crumb: string
  title: string
  insightTitle: string
  insightBody: string
}

export interface CommandCenterCopy {
  eyebrow: string
  title: string
  emphasis: string
  lead: string
  tabsLabel: string
  demoBadge: string
  insightLabel: string
  illustrative: string
  hint: string
  prev: string
  next: string
  scenes: {
    overview: SceneCopy
    pos: SceneCopy
    stock: SceneCopy
    wholesale: SceneCopy
    reports: SceneCopy
  }
  overview: {
    sales: string
    salesNote: string
    ticket: string
    ticketNote: string
    low: string
    lowNote: string
    movement: string
    top: string
    unit: string
  }
  pos: { sale: string; open: string; wholesaleBadge: string; perUnit: string; total: string; finish: string }
  stock: { product: string; retail: string; wholesale: string; stock: string; unit: string; from: string }
  wholesale: { retailTier: string; wholesaleTier: string; unitPrice: string; note: string }
  reports: { title: string; opening: string; cash: string; pix: string; debit: string; credit: string; total: string; status: string }
}

export interface WholesaleCopy {
  eyebrow: string
  title: string
  emphasis: string
  lead: string
  ruleLabel: string
  product: string
  ruleNote: string
  widgetTitle: string
  quantity: string
  decrease: string
  increase: string
  unitPrice: string
  total: string
  retail: string
  wholesale: string
  simulated: string
  missingOne: string
  missingMany: string
  applied: string
  disclaimer: string
}

export interface TrialFormCopy {
  top: string
  title: string
  lead: string
  name: string
  store: string
  contact: string
  contactHint: string
  segment: string
  segmentPlaceholder: string
  segments: readonly SegmentOption[]
  idioma: string
  submit: string
  sending: string
  note: string
  privacy: string
  errName: string
  errStore: string
  errContact: string
  errSegment: string
  errRate: string
  okTitle: string
  okBody: string
  okProtocol: string
  okKeep: string
  okWhatsapp: string
  failTitle: string
  failBody: string
  failEmail: string
  failWhatsapp: string
  mailSubject: string
  thanksTitle: string
  thanksBody: string
  thanksWaText: string
  back: string
}

export interface ContactCopy {
  fab: string
  whatsapp: string
  emailLabel: string
  email: string
  opensNewTab: string
}

export interface HomeContent {
  meta: { title: string; description: string }
  skipLink: string
  brandLabel: string
  brandTagline: string
  nav: {
    label: string
    vision: string
    experience: string
    operation: string
    faq: string
    cta: string
    demo: string
    login: string
    menuOpen: string
    menuClose: string
  }
  langSwitch: { group: string; pt: string; ptShort: string; zh: string; zhShort: string }
  hero: {
    label: string
    h1: { line1: string; line2: string; line3: string }
    lead: string
    ctaPrimary: string
    ctaSecondary: string
    statement: string
    bottom: readonly [string, string, string]
  }
  statement: {
    eyebrow: string
    title: string
    emphasis: string
    body: string
    problemsTitle: string
    problems: readonly TitledPlain[]
    audienceTitle: string
    audience: readonly string[]
    audienceNote: string
    rail: readonly string[]
    railZh: readonly string[]
  }
  commandCenter: CommandCenterCopy
  difference: {
    eyebrow: string
    title: readonly [string, string]
    emphasis: string
    body: string
    items: readonly TitledPlain[]
    link: string
    artCoordinate: readonly [string, string]
    artLabel: string
    artPt: string
    artZh: string
    artNote: string
  }
  wholesale: WholesaleCopy
  process: {
    eyebrow: string
    title: string
    emphasis: string
    lead: string
    cta: string
    steps: readonly TitledPlain[]
  }
  faq: { eyebrow: string; title: string; items: readonly FaqItem[] }
  final: {
    eyebrow: string
    title: string
    emphasis: string
    lead: string
    lines: readonly [string, string]
  }
  form: TrialFormCopy
  contact: ContactCopy
  footer: {
    tagline: string
    zhTagline: string
    exploreTitle: string
    contactTitle: string
    legalTitle: string
    privacy: string
    terms: string
    login: string
    ptOnly: string
  }
}
