/**
 * Núcleo i18n (catálogo / fallback) — barrel público Missão 5.2b.
 * Carregamento de JSON permanece na app até 5.2c.
 */

export type {
  CatalogMap,
  MessageCatalog,
  ResolveMessageInput,
  ResolveMessageResult,
} from './types'

export { fallbackLocaleChain, resolveMessage } from './fallbackPolicy'

// Reexport locale bridge para import único `@shared-core/src/i18n` quando útil.
export {
  bridgeLegacyIdioma,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  resolveLocale,
  SUPPORTED_LOCALES,
  toLegacyIdioma,
} from '../locale'
export type { AppLocale, LegacyIdioma } from '../locale'
