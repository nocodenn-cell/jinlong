import type { Idioma } from './normalizeIdioma'

/** BCP 47 para o atributo `lang` do documento, alinhado ao conteúdo i18n. */
export function htmlLangFromIdioma(idioma: Idioma): string {
  if (idioma === 'zh') return 'zh-CN'
  if (idioma === 'zh-HK') return 'zh-HK'
  return 'pt-BR'
}
