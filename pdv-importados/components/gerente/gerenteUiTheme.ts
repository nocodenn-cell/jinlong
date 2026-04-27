export const GERENTE_UI_THEME_STORAGE_KEY = 'dragonpos-gerente-ui-theme'

export type GerenteUiTheme = 'noturno' | 'novem'

export function parseGerenteUiTheme(raw: string | null): GerenteUiTheme {
  // Compatibilidade retroativa com os temas antigos.
  if (raw === 'dragon-light' || raw === 'novem') return 'novem'
  return 'noturno'
}

export function isGerenteLightChrome(theme: GerenteUiTheme): boolean {
  return theme === 'novem'
}