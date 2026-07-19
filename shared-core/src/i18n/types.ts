import type { AppLocale } from '../locale'

/** Catálogo genérico (árvore de strings) — JSON legado migra para cá depois. */
export type MessageCatalog = Record<string, unknown>

export type CatalogMap = Partial<Record<AppLocale, MessageCatalog>>

export type ResolveMessageInput = {
  catalogs: CatalogMap
  locale: AppLocale
  /** Path com pontos, ex.: `clientes.titulo`. */
  key: string
}

export type ResolveMessageResult = {
  value: string
  /** Locale de onde a string foi lida (pode ser fallback). */
  resolvedLocale: AppLocale
  /** true se devolveu a própria key (missing em todos os fallbacks). */
  missing: boolean
}
