import { redirect } from 'next/navigation'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'

type SearchParams = { status?: string; periodo?: string }

type PageProps = { searchParams?: Promise<SearchParams> }

/** Legado — contas a pagar unificadas em /admin/financeiro. */
export default async function ContasPagarRedirectPage({ searchParams }: PageProps) {
  const sp = (searchParams ? await searchParams : {}) ?? {}
  const q = new URLSearchParams({ tab: 'pagar' })
  if (sp.status) q.set('status', sp.status)
  if (sp.periodo) q.set('periodo', sp.periodo)
  redirect(pathWithQuery(ROUTES.admin.financeiro, q))
}
