/** Contrato único de conteúdo do site — pt-BR e zh-CN implementam a mesma forma. */

export interface FeatureItem {
  title: string
  body: string
  note: string
}

export interface JourneyStep {
  title: string
  body: string
}

export interface PdvPreviewCopy {
  sample: string
  sale: string
  qty: string
  decrease: string
  increase: string
  atacado: string
  varejo: string
  total: string
  payment: string
  methods: readonly string[]
  hint: string
}

export interface ChannelCopy {
  whatsapp: string
  wechat: string
  wechatIdLabel: string
  open: string
}

export interface HomeContent {
  meta: { title: string; description: string }
  nav: { features: string; demo: string; journey: string; contact: string; login: string; menuLabel: string }
  hero: { eyebrow: string; title: string; lead: string; ctaPrimary: string; ctaSecondary: string; proof: readonly string[] }
  preview: PdvPreviewCopy
  features: { eyebrow: string; title: string; items: readonly FeatureItem[] }
  journey: { eyebrow: string; title: string; lead: string; steps: readonly JourneyStep[] }
  contact: {
    eyebrow: string
    title: string
    lead: string
    unavailable: string
    channels: ChannelCopy
  }
  footer: { rights: string; privacy: string; terms: string; ptOnly: string }
  locale: { switchLabel: string; other: string; draftBanner: string }
  skipLink: string
}
