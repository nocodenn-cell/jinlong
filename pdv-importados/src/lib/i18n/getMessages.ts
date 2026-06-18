import ptRaw from './pt.json'
import zhRaw from './zh.json'
import type { Idioma } from '../idioma/normalizeIdioma'
import { normalizeIdioma } from '../idioma/normalizeIdioma'

function mergeCadastroComum<T extends typeof ptRaw>(raw: T) {
  const c = raw.cadastro_comum
  return {
    ...raw,
    categorias_produtos: { ...c, ...raw.categorias_produtos },
    categorias_financeiras: { ...c, ...raw.categorias_financeiras },
  }
}

const pt = mergeCadastroComum(ptRaw)
const zh = mergeCadastroComum(zhRaw)

export type Mensagens = typeof pt

export function getMessages(idioma: Idioma): Mensagens {
  if (idioma === 'zh') return zh as unknown as Mensagens
  // 'en' e 'es' usam PT como fallback até as traduções estarem prontas
  return pt as Mensagens
}

/**
 * Resolve mensagens com fallback estável para evitar telas quebradas:
 * idioma recebido -> fallback chinês (quando aplicável) -> pt.
 */
export function getMessagesWithFallback(idioma: unknown): Mensagens {
  const normalized = normalizeIdioma(idioma)
  return getMessages(normalized)
}

