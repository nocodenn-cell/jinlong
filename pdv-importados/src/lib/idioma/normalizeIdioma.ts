export type Idioma = 'pt' | 'zh' | 'zh-HK'

export function normalizeIdioma(value: unknown): Idioma {
  if (value === 'zh') return 'zh'
  if (value === 'zh-HK') return 'zh-HK'
  if (typeof value === 'string' && value.toLowerCase() === 'zh-hk') return 'zh-HK'
  return 'pt'
}

