/**
 * Modelo compartilhado de abas de hub (Sprint 6 — simplificação UX).
 * Hubs agrupam rotas relacionadas sem fundir páginas nem alterar SSOT de entidades.
 */

export type HubTabDef = {
  id: string
  label: string
  href: string
  /**
   * `exact`: só a URL exata (ex.: saldo em /admin/estoque).
   * `prefix`: href ou subpaths (ex.: /admin/catalogo/novo).
   */
  match: 'exact' | 'prefix'
  aliases?: readonly string[]
}

export function hubTabIsActive(pathname: string, tab: HubTabDef): boolean {
  const path = pathname.replace(/\/$/, '') || '/'
  if (tab.aliases?.some((alias) => path === alias || path.startsWith(`${alias}/`))) return true
  const href = tab.href.replace(/\/$/, '') || '/'
  if (tab.match === 'exact') {
    return path === href
  }
  return path === href || path.startsWith(`${href}/`)
}

export function resolveActiveHubTabId(pathname: string, tabs: readonly HubTabDef[]): string | null {
  for (const tab of tabs) {
    if (hubTabIsActive(pathname, tab)) return tab.id
  }
  return null
}
