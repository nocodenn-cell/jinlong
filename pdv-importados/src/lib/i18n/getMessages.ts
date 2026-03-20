import pt from './pt.json'
import zh from './zh.json'
import zhHK from './zh-HK.json'
import type { Idioma } from '../idioma/normalizeIdioma'

export type Mensagens = typeof pt

export function getMessages(idioma: Idioma): Mensagens {
  if (idioma === 'zh') return zh as Mensagens
  if (idioma === 'zh-HK') return zhHK as Mensagens
  return pt as Mensagens
}

