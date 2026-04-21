import type { Mensagens } from '@/src/lib/i18n/getMessages'

/**
 * Chaves canónicas dos módulos do painel gerencial + dashboard admin.
 * Uma única fonte de hrefs — layouts /gerente e /admin e atalhos devem derivar daqui.
 */
export type PainelGerencialNavKey =
  | 'home'
  | 'dashboard'
  | 'produtos'
  | 'vendas'
  | 'estoque'
  | 'recebimento'
  | 'transferencias'
  | 'financeiro'
  | 'caixas'
  | 'relatorios'

export function painelGerencialHref(key: PainelGerencialNavKey): string {
  if (key === 'home') return '/gerente'
  if (key === 'dashboard') return '/admin/dashboard'
  return `/gerente/${key}`
}

/** Chave em `m.admin.nav` / `admin.navHints` (home = painel /gerente). */
export type AdminNavDictionaryKey = keyof Mensagens['admin']['nav']

export function adminNavDictionaryKey(key: PainelGerencialNavKey): AdminNavDictionaryKey {
  if (key === 'home') return 'gerente'
  return key as AdminNavDictionaryKey
}

export function gerenteNavLabel(m: Mensagens, key: PainelGerencialNavKey): string {
  switch (key) {
    case 'home':
      return m.gerente.inicio
    case 'dashboard':
      return m.gerente.nav_admin
    case 'produtos':
      return m.produtos.titulo
    case 'estoque':
      return m.estoque.titulo
    case 'recebimento':
      return m.gerente.nav_recebimento
    case 'transferencias':
      return m.gerente.nav_transferencias
    case 'financeiro':
      return m.gerente.nav_financeiro
    case 'vendas':
      return m.gerente.nav_vendas
    case 'caixas':
      return m.gerente.nav_caixas
    case 'relatorios':
      return m.gerente.nav_relatorios
    default: {
      const _exhaustive: never = key
      return _exhaustive
    }
  }
}

/** Ordem do header horizontal em `/gerente`. */
export const GERENTE_HEADER_NAV_ORDER: readonly PainelGerencialNavKey[] = [
  'home',
  'produtos',
  'estoque',
  'recebimento',
  'transferencias',
  'financeiro',
  'vendas',
  'caixas',
  'relatorios',
  'dashboard',
] as const

/** Ordem dos atalhos na página inicial `/gerente` (sem “início”; transferências opcional). */
export function gerenteInicioAtalhoKeys(
  incluirTransferencias: boolean
): readonly PainelGerencialNavKey[] {
  const base: PainelGerencialNavKey[] = [
    'produtos',
    'estoque',
    'recebimento',
    ...(incluirTransferencias ? (['transferencias'] as const) : []),
    'financeiro',
    'vendas',
    'caixas',
    'relatorios',
    'dashboard',
  ]
  return base
}
