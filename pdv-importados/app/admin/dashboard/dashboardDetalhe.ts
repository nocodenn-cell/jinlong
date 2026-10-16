import { ROUTES, pathWithQuery } from '@/lib/navigation/routes'

/** Drill-down dos KPIs do Dashboard; o detalhe aberto vive na URL (`?detalhe=`). */
export type DashboardDetalhe = 'vendas' | 'pedidos'

export function normalizeDetalhe(raw: string | undefined): DashboardDetalhe | null {
  return raw === 'vendas' || raw === 'pedidos' ? raw : null
}

/** URL do Dashboard preservando período/status; `detalhe` null fecha a gaveta. */
export function dashboardHref(
  params: { period?: string; status?: string },
  detalhe: DashboardDetalhe | null,
): string {
  const q = new URLSearchParams()
  if (params.period) q.set('period', params.period)
  if (params.status) q.set('status', params.status)
  if (detalhe) q.set('detalhe', detalhe)
  return pathWithQuery(ROUTES.admin.dashboard, q)
}
