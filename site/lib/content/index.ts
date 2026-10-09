import type { SiteLocale } from '../locales'
import { homePt } from './home.pt'
import { homeZh } from './home.zh'
import type { HomeContent } from './types'

const HOME_BY_LOCALE: Record<SiteLocale, HomeContent> = {
  'pt-BR': homePt,
  'zh-CN': homeZh,
}

export function getHomeContent(locale: SiteLocale): HomeContent {
  return HOME_BY_LOCALE[locale]
}

export type { HomeContent } from './types'
