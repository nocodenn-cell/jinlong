export const GERENTE_UI_THEME_STORAGE_KEY = 'fastproduct-app-theme'

export type GerenteUiTheme = 'noturno' | 'classico'

export function parseGerenteUiTheme(raw: string | null): GerenteUiTheme {
  return raw === 'classico' ? 'classico' : 'noturno'
}

export function isGerenteLightChrome(theme: GerenteUiTheme): boolean {
  return theme === 'classico'
}
