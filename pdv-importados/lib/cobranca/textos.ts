/**
 * Textos da cobrança/trial: vêm do i18n existente (src/lib/i18n/{pt,zh}.json → chave `cobranca`).
 * Revisão por falante nativo do chinês pendente.
 */
import pt from '@/src/lib/i18n/pt.json'
import zh from '@/src/lib/i18n/zh.json'

export type ChaveTexto = keyof typeof pt.cobranca
export const tc = (idioma: string | null | undefined, k: ChaveTexto): string =>
  ((idioma === 'zh' ? zh.cobranca : pt.cobranca) as Record<string, string>)[k] ?? pt.cobranca[k]
