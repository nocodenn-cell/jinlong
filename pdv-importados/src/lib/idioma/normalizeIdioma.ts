export type Idioma = 'pt' | 'zh'

export function normalizeIdioma(value: unknown): Idioma {
  if (value === 'zh' || value === 'zh-HK') return 'zh' as Idioma
  return 'pt'
}

