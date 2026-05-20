export const GERENTE_UI_THEME_STORAGE_KEY = 'dragonpos-gerente-ui-theme'

export type GerenteUiTheme = 'noturno' | 'novem'

export function parseGerenteUiTheme(): GerenteUiTheme {
  return 'noturno'
}

export function isGerenteLightChrome(): boolean {
  return false
}
