export const GERENTE_UI_THEME_STORAGE_KEY = 'dragonpos-gerente-ui-theme'

export type GerenteUiTheme = 'dragon-dark' | 'dragon-light'

export function parseGerenteUiTheme(raw: string | null): GerenteUiTheme {
  return raw === 'dragon-light' ? 'dragon-light' : 'dragon-dark'
}

export function isGerenteLightChrome(theme: GerenteUiTheme): boolean {
  return theme === 'dragon-light'
}