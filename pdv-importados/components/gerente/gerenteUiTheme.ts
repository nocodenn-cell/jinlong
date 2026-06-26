import { type GerenteUiTheme } from '@/lib/theme/contract'

export const GERENTE_UI_THEME_STORAGE_KEY = 'dragonpos-gerente-ui-theme'

// Tipo do contrato central (lib/theme/contract.ts). Reexportado por
// compatibilidade — os nomes de tema válidos vivem apenas no contrato.
export type { GerenteUiTheme }

export function parseGerenteUiTheme(raw: string | null): GerenteUiTheme {
  return raw === 'dragon-light' ? 'dragon-light' : 'dragon-dark'
}

export function isGerenteLightChrome(theme: GerenteUiTheme): boolean {
  return theme === 'dragon-light'
}
