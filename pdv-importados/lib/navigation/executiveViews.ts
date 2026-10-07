/**
 * SSoT das 5 abas executivas (BI).
 * Aba 1 = `/admin/dashboard`; abas 2–5 = `/admin/relatorios?view=…`.
 */
import { ROUTES } from '@/lib/navigation/routes'

export const EXECUTIVE_VIEW_IDS = [
  'visao-geral',
  'vendas-caixas',
  'dre-financeiro',
  'produtos-estoque',
  'crm-auditoria',
] as const

export type ExecutiveViewId = (typeof EXECUTIVE_VIEW_IDS)[number]

/** Views hospedadas em `/admin/relatorios` (exclui Visão Geral). */
export type ExecutiveRelatoriosViewId = Exclude<ExecutiveViewId, 'visao-geral'>

export const EXECUTIVE_RELATORIOS_VIEW_IDS: readonly ExecutiveRelatoriosViewId[] = [
  'vendas-caixas',
  'dre-financeiro',
  'produtos-estoque',
  'crm-auditoria',
] as const

export function isExecutiveRelatoriosView(raw: string | null | undefined): raw is ExecutiveRelatoriosViewId {
  return (
    raw === 'vendas-caixas' ||
    raw === 'dre-financeiro' ||
    raw === 'produtos-estoque' ||
    raw === 'crm-auditoria'
  )
}

export function parseExecutiveView(raw: string | null | undefined): ExecutiveViewId {
  if (raw === 'visao-geral' || isExecutiveRelatoriosView(raw)) return raw
  return 'visao-geral'
}

export function executiveRelatoriosHref(view: ExecutiveRelatoriosViewId): string {
  return `${ROUTES.admin.relatorios}?view=${view}`
}

export function executiveViewHref(view: ExecutiveViewId): string {
  if (view === 'visao-geral') return ROUTES.admin.dashboard
  return executiveRelatoriosHref(view)
}
