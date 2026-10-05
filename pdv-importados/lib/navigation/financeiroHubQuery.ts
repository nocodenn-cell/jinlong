import { ROUTES, pathWithQuery } from '@/lib/navigation/routes'

import type { FinanceiroTabId } from './financeiroTabId'
export type FinanceiroHubTabId = FinanceiroTabId

/** Params relevantes por aba — evita “filtros fantasma” ao trocar de aba no hub. */
const TAB_QUERY_KEYS: Record<FinanceiroHubTabId, readonly string[]> = {
  receber: ['tab', 'opcao', 'cliente', 'q', 'de', 'ate', 'limite'],
  pagar: ['tab', 'status', 'periodo'],
  fiscal: ['tab'],
  resumo: ['tab', 'de', 'ate'],
  contas: ['tab', 'de', 'ate', 'pagina'],
  recebiveis: ['tab', 'de', 'ate', 'pagina'],
  conciliacao: ['tab', 'de', 'ate', 'pagina'],
  resultado: ['tab', 'de', 'ate'],
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
