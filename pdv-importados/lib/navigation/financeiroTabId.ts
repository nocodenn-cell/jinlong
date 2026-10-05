/** Id das abas do hub Financeiro — tipo neutro, fora de `app/` para `components/ui` não depender de rotas. */
export type FinanceiroTabId = 'receber' | 'pagar' | 'fiscal' | 'resumo' | 'contas' | 'recebiveis' | 'conciliacao' | 'resultado'

export const FINANCEIRO_TAB_ORDER: readonly FinanceiroTabId[] = [
  'resumo', 'receber', 'pagar', 'contas', 'recebiveis', 'conciliacao', 'resultado', 'fiscal',
]
