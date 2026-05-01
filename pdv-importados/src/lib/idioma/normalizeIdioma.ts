export type Idioma = 'pt' | 'zh' | 'zh-HK'

export function normalizeIdioma(value: unknown): Idioma {
  if (value === 'zh' || value === 'zh-HK') return value as Idioma
  return 'pt'
}

