/**
 * Contrato das abas do Financeiro — módulo neutro (sem 'use client').
 *
 * Existe separado de FinanceiroTabNav.tsx porque `page.tsx` é Server Component e
 * precisa de `parseFinanceiroTab` para resolver a aba a partir da searchParam.
 * Enquanto essa função morava no módulo marcado com 'use client', o import do
 * servidor virava uma referência de cliente e a página quebrava em runtime com
 * "Attempted to call parseFinanceiroTab() from the server but parseFinanceiroTab
 * is on the client" (Sentry FASTPRODUCT-PDV-2).
 *
 * Regra: só entra aqui o que for puro e utilizável nos dois runtimes.
 */

import type { FinanceiroTabId } from '@/lib/navigation/financeiroTabId'

export type { FinanceiroTabId }

export const FINANCEIRO_TABS: ReadonlyArray<{ id: FinanceiroTabId; label: string }> = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'contas', label: 'Contas e movimentos' },
  { id: 'recebiveis', label: 'PIX e cartões' },
  { id: 'conciliacao', label: 'Conciliação' },
  { id: 'resultado', label: 'Resultado' },
  { id: 'receber', label: 'A receber' },
  { id: 'pagar', label: 'A pagar' },
  { id: 'fiscal', label: 'Fila fiscal' },
]

export function parseFinanceiroTab(raw: string | undefined): FinanceiroTabId {
  const tab = FINANCEIRO_TABS.find(t => t.id === raw)
  if (tab) return tab.id
  return 'receber'
}
