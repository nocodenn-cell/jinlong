import { ROUTES } from '@/lib/navigation/routes'

/**
 * Active state da sidebar Admin V2 — suporta hrefs com `?view=` (abas executivas).
 */
export function isAdminNavActive(pathname: string, search: string, href: string): boolean {
  const [pathPart, queryPart] = href.split('?')
  const path = pathPart || href

  if (queryPart) {
    if (pathname !== path) return false
    const wanted = new URLSearchParams(queryPart).get('view')
    const current = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('view')
    return wanted != null && wanted === current
  }

  if (path === ROUTES.gerente.home) {
    return pathname === ROUTES.gerente.home || pathname === `${ROUTES.gerente.home}/`
  }

  if (path === ROUTES.admin.dashboard) {
    return pathname === path || pathname === `${path}/`
  }

  // Base `/admin/relatorios` (sem view) — ativo só quando não há `view` na URL.
  if (path === ROUTES.admin.relatorios) {
    if (pathname !== path && !pathname.startsWith(`${path}/`)) return false
    const current = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('view')
    return current == null || current === ''
  }

  if (path.startsWith(`${ROUTES.admin.home}/`)) {
    return pathname === path || pathname.startsWith(`${path}/`)
  }

  return pathname === path || pathname.startsWith(`${path}/`)
}
