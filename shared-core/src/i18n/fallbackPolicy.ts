import { FALLBACK_LOCALE, type AppLocale } from '../locale'
import type {
  MessageCatalog,
  ResolveMessageInput,
  ResolveMessageResult,
} from './types'

/**
 * Cadeia ADR-005: requested → pt-BR → key.
 * Se o pedido já é pt-BR, só tenta pt-BR depois key.
 */
export function fallbackLocaleChain(locale: AppLocale): AppLocale[] {
  if (locale === FALLBACK_LOCALE) return [FALLBACK_LOCALE]
  return [locale, FALLBACK_LOCALE]
}

function lookupPath(catalog: MessageCatalog, key: string): string | undefined {
  if (!key) return undefined
  let cur: unknown = catalog
  for (const part of key.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return typeof cur === 'string' ? cur : undefined
}

/**
 * Resolve mensagem com fallback de catálogo.
 * Não carrega JSON — a borda passa `catalogs` (scaffold 5.2b).
 */
export function resolveMessage(input: ResolveMessageInput): ResolveMessageResult {
  for (const loc of fallbackLocaleChain(input.locale)) {
    const catalog = input.catalogs[loc]
    if (!catalog) continue
    const value = lookupPath(catalog, input.key)
    if (value !== undefined) {
      return { value, resolvedLocale: loc, missing: false }
    }
  }
  return {
    value: input.key,
    resolvedLocale: FALLBACK_LOCALE,
    missing: true,
  }
}
