import type { HomeContent } from './types'

/** Textos renderizados com a fonte de títulos (Noto Serif SC em zh-CN). */
export function displayStrings(content: HomeContent): string[] {
  return [
    content.hero.title,
    content.preview.sale,
    content.features.title,
    ...content.features.items.map((item) => item.title),
    content.journey.title,
    ...content.journey.steps.map((step) => step.title),
    content.contact.title,
    '金',
  ]
}

const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/g

/** Caracteres CJK únicos (ordenados) que a fonte de títulos precisa cobrir. */
export function cjkDisplayChars(content: HomeContent): string {
  const chars = new Set(displayStrings(content).join('').match(CJK) ?? [])
  return [...chars].sort().join('')
}
