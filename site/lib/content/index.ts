import type { SiteLocale } from '../locales'
import { homePt } from './home.pt'
import { homeZh } from './home.zh'
import type { HomeContent } from './types'
import { CTA_LABEL, CTA_MODE } from '../siteConfig'

const HOME_BY_LOCALE: Record<SiteLocale, HomeContent> = {
  'pt-BR': homePt,
  'zh-CN': homeZh,
}

export function getHomeContent(locale: SiteLocale): HomeContent {
  const base = HOME_BY_LOCALE[locale]
  if (CTA_MODE === 'demo') return base
  const cta = CTA_LABEL.trial[locale]
  return {
    ...base,
    nav: { ...base.nav, cta },
    hero: { ...base.hero, ctaTrial: cta },
    price: { ...base.price, cta },
    form: { ...base.form, title: cta, submit: cta },
  }
}

export type { HomeContent } from './types'
