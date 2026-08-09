import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'

export type FinanceiroHubTabId = 'receber' | 'pagar' | 'fiscal' | 'categorias'

export const FINANCEIRO_HUB_TAB_LABELS: Record<FinanceiroHubTabId, string> = {
  receber: 'A receber',
  pagar: 'A pagar',
  fiscal: 'Fila fiscal',
  categorias: 'Categorias',
}

export function financeiroTabHref(tab: 'receber' | 'pagar' | 'fiscal'): string {
  const p = new URLSearchParams()
  p.set('tab', tab)
  return pathWithQuery(ROUTES.admin.financeiro, p)
}

export function resolveFinanceiroHubActiveId(
  pathname: string,
  tabParam: 'receber' | 'pagar' | 'fiscal',
): FinanceiroHubTabId {
  if (pathname.startsWith(ROUTES.admin.categoriasFinanceiras)) {
    return 'categorias'
  }
  return tabParam
}
