import { ROUTES, pathWithQuery } from '@/lib/navigation/routes'

export type FinanceiroHubTabId = 'receber' | 'pagar' | 'fiscal'

/** Params relevantes por aba — evita “filtros fantasma” ao trocar de aba no hub. */
const TAB_QUERY_KEYS: Record<FinanceiroHubTabId, readonly string[]> = {
  receber: ['tab', 'opcao', 'cliente', 'q', 'de', 'ate', 'limite'],
  pagar: ['tab', 'status', 'periodo'],
  fiscal: ['tab'],
}

export function financeiroHrefForTab(
  tab: FinanceiroHubTabId,
  raw: URLSearchParams | Readonly<URLSearchParams>,
): string {
  const allowed = new Set(TAB_QUERY_KEYS[tab])
  const p = new URLSearchParams()
  p.set('tab', tab)
  raw.forEach((value, key) => {
    if (allowed.has(key) && key !== 'tab') {
      p.set(key, value)
    }
  })
  return pathWithQuery(ROUTES.admin.financeiro, p)
}
