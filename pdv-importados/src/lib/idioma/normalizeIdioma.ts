export type Idioma = 'pt' | 'zh' | 'en' | 'es'

export function normalizeIdioma(value: unknown): Idioma {
  if (value === 'zh' || value === 'zh-HK') return 'zh'
  if (value === 'en') return 'en'
  if (value === 'es') return 'es'
  return 'pt'
}
