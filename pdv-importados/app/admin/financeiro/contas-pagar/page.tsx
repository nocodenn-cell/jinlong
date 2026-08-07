/**
 * Alias legado — Sprint 2 / RFC-UX-007 / UX-P1-11.
 * Contas a pagar vive só no hub: /admin/financeiro?tab=pagar
 */

import { redirect } from 'next/navigation'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'

type SearchParams = {
  status?: string
  periodo?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminContasPagarPage({ searchParams }: PageProps) {
  await loadAdminContext({
    pathname: ROUTES.admin.financeiroContasPagar,
    resource: `route:${ROUTES.admin.financeiroContasPagar}`,
  })

  const sp = (searchParams ? await searchParams : {}) ?? {}
  const p = new URLSearchParams()
  p.set('tab', 'pagar')
  if (sp.status) p.set('status', sp.status)
  if (sp.periodo) p.set('periodo', sp.periodo)
  redirect(pathWithQuery(ROUTES.admin.financeiro, p))
}
