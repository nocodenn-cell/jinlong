import pt from './pt.json'
import zh from './zh.json'
import zhHK from './zh-HK.json'
import type { Idioma } from '../idioma/normalizeIdioma'
import { normalizeIdioma } from '../idioma/normalizeIdioma'

export type Mensagens = typeof pt

export function getMessages(idioma: Idioma): Mensagens {
  if (idioma === 'zh') return zh as Mensagens
  if (idioma === 'zh-HK') return zhHK as Mensagens
  return pt as Mensagens
}

/**
 * Resolve mensagens com fallback estável para evitar telas quebradas:
 * idioma recebido -> fallback chinês (quando aplicável) -> pt.
 */
export function getMessagesWithFallback(idioma: unknown): Mensagens {
  const normalized = normalizeIdioma(idioma)
  const primary = getMessages(normalized)
  if (primary) return primary
  if (normalized === 'zh-HK') return getMessages('zh')
  if (normalized === 'zh') return getMessages('zh-HK')
  return getMessages('pt')
}

