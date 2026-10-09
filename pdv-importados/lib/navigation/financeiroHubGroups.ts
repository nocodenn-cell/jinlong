import { ROUTES } from '@/lib/navigation/routes'
import { financeiroHrefForTab } from '@/lib/navigation/financeiroHubQuery'
import type { FinanceiroTabId } from '@/lib/navigation/financeiroTabId'

/**
 * Barra do Financeiro agrupada (UX-IA-01 PR 5).
 *
 * Os 8 `?tab=` e a rota de Categorias NÃO mudam: continuam abrindo exatamente o mesmo
 * conteúdo. Muda só como a barra os apresenta — 9 controles viram 7, com uma segunda linha
 * (seletor) dentro dos grupos que têm mais de uma vista:
 *
 *   Resumo ▸ (Resumo | Resultado de caixa)
 *   A receber · A pagar
 *   Contas e conciliação ▸ (Contas e saldos | PIX e cartões | Conciliação)
 *   Fiscal · Comissões · Categorias
 *
 * "Resultado de caixa" (regime de caixa) NÃO é o DRE (competência): são regras distintas e
 * continuam em lugares distintos.
 */
export type FinanceiroGroupId = 'resumo' | 'receber' | 'pagar' | 'contas' | 'fiscal'

export const FINANCEIRO_GROUPS: ReadonlyArray<{
  id: FinanceiroGroupId
  /** Abas do grupo; a primeira é a de entrada. */
  tabs: readonly FinanceiroTabId[]
}> = [
  { id: 'resumo', tabs: ['resumo', 'resultado'] },
  { id: 'receber', tabs: ['receber'] },
  { id: 'pagar', tabs: ['pagar'] },
  { id: 'contas', tabs: ['contas', 'recebiveis', 'conciliacao'] },
  { id: 'fiscal', tabs: ['fiscal'] },
]

export function financeiroGroupOf(tab: FinanceiroTabId): FinanceiroGroupId {
  const g = FINANCEIRO_GROUPS.find((x) => x.tabs.includes(tab))
  // Toda aba pertence a um grupo; o fallback só protege contra um id novo esquecido aqui.
  return g?.id ?? 'receber'
}

export type FinanceiroHubLabels = {
  resumo: string
  resultado: string
  receber: string
  pagar: string
  contasConciliacao: string
  contas: string
  recebiveis: string
  conciliacao: string
  fiscal: string
  comissoes: string
  categorias: string
}

export type FinanceiroHubItem = { id: string; label: string; href: string; active: boolean }

export type FinanceiroHubModel = {
  primary: FinanceiroHubItem[]
  /** Segunda linha: só existe quando o grupo ativo tem mais de uma vista. */
  secondary: FinanceiroHubItem[] | null
}

const GROUP_LABEL_KEY: Record<FinanceiroGroupId, keyof FinanceiroHubLabels> = {
  resumo: 'resumo',
  receber: 'receber',
  pagar: 'pagar',
  contas: 'contasConciliacao',
  fiscal: 'fiscal',
}

const TAB_LABEL_KEY: Record<FinanceiroTabId, keyof FinanceiroHubLabels> = {
  resumo: 'resumo',
  resultado: 'resultado',
  receber: 'receber',
  pagar: 'pagar',
  contas: 'contas',
  recebiveis: 'recebiveis',
  conciliacao: 'conciliacao',
  fiscal: 'fiscal',
}

/**
 * @param pathname  rota atual (para marcar Comissões/Categorias, que são páginas próprias)
 * @param activeTab aba lida de `?tab=` (só vale quando a rota é /admin/financeiro)
 */
export function buildFinanceiroHub(input: {
  pathname: string
  activeTab: FinanceiroTabId
  searchParams: URLSearchParams | Readonly<URLSearchParams>
  labels: FinanceiroHubLabels
}): FinanceiroHubModel {
  const { pathname, activeTab, searchParams, labels } = input
  const onFinanceiro = pathname === ROUTES.admin.financeiro
  const onComissoes = pathname.startsWith(ROUTES.admin.comissoes)
  const onCategorias = pathname.startsWith(ROUTES.admin.categoriasFinanceiras)
  const activeGroup = financeiroGroupOf(activeTab)

  const primary: FinanceiroHubItem[] = [
    ...FINANCEIRO_GROUPS.map((g) => ({
      id: g.id,
      label: labels[GROUP_LABEL_KEY[g.id]],
      href: financeiroHrefForTab(g.tabs[0]!, searchParams),
      active: onFinanceiro && activeGroup === g.id,
    })),
    { id: 'comissoes', label: labels.comissoes, href: ROUTES.admin.comissoes, active: onComissoes },
    { id: 'categorias', label: labels.categorias, href: ROUTES.admin.categoriasFinanceiras, active: onCategorias },
  ]

  const group = FINANCEIRO_GROUPS.find((g) => g.id === activeGroup)
  const secondary =
    onFinanceiro && group && group.tabs.length > 1
      ? group.tabs.map((tab) => ({
          id: tab,
          label: labels[TAB_LABEL_KEY[tab]],
          href: financeiroHrefForTab(tab, searchParams),
          active: tab === activeTab,
        }))
      : null

  return { primary, secondary }
}
