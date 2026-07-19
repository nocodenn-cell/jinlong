/**
 * Núcleo de locale (BCP 47) — barrel público Missão 5.2b.
 */

export type { AppLocale, LegacyIdioma } from './types'
export {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
} from './types'

export {
  bridgeLegacyIdioma,
  resolveLocale,
  toLegacyIdioma,
} from './resolveLocale'
