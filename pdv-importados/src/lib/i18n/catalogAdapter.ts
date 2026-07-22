/**
 * Adapter de catálogo — Missão 5.2c.
 * Carrega JSON legado pt/zh e resolve via @fastproduct/shared-core (locale + fallback).
 * Não substitui getMessages global; login é o primeiro consumidor.
 */

import {
  resolveLocale,
  resolveMessage,
  toLegacyIdioma,
  type AppLocale,
  type CatalogMap,
  type MessageCatalog,
  type ResolveMessageResult,
} from '@shared-core/src/i18n'
import { getMessages, type Mensagens } from './getMessages'

/** Catálogos BCP 47 a partir dos JSON existentes (paridade PT/ZH). */
export function buildLegacyCatalogMap(): CatalogMap {
  return {
    'pt-BR': getMessages('pt') as unknown as MessageCatalog,
    'zh-CN': getMessages('zh') as unknown as MessageCatalog,
    // en-US omitido de propósito → resolveMessage cai em pt-BR
  }
}

const catalogs = buildLegacyCatalogMap()

export type MessagesBundle = {
  locale: AppLocale
  /** Tag curta para APIs legadas / cookie `idioma_preferido`. */
  legacyIdioma: 'pt' | 'zh'
  messages: Mensagens
}

/**
 * Resolve locale (bridge pt→pt-BR, zh→zh-CN, en-US, inválido→pt-BR)
 * e devolve o bundle de mensagens tipado (legado getMessages).
 */
export function getMessagesForLocaleInput(input: unknown): MessagesBundle {
  const locale = resolveLocale(input)
  const legacyIdioma = toLegacyIdioma(locale)
  return {
    locale,
    legacyIdioma,
    messages: getMessages(legacyIdioma),
  }
}

/** Resolve uma chave com política de fallback do shared-core. */
export function resolveAppMessage(input: unknown, key: string): ResolveMessageResult {
  return resolveMessage({
    catalogs,
    locale: resolveLocale(input),
    key,
  })
}

/** Atalho: só o texto resolvido. */
export function tApp(input: unknown, key: string): string {
  return resolveAppMessage(input, key).value
}
