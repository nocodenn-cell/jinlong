export type Idioma = 'pt' | 'zh'

export function normalizeIdioma(value: unknown): Idioma {
  if (value === 'zh') return 'zh'
  return 'pt'
}

