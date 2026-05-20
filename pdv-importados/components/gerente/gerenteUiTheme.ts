export const GERENTE_UI_THEME_STORAGE_KEY = 'dragonpos-gerente-ui-theme'

export type GerenteUiTheme = 'noturno' | 'novem'

export function parseGerenteUiTheme(_raw: string | null): GerenteUiTheme {
  return 'noturno'
}

export function isGerenteLightChrome(_theme: GerenteUiTheme): boolean {
  return false
}