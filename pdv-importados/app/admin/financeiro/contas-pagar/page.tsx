import { redirect } from 'next/navigation'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'

type SearchParams = {
  status?: string
  periodo?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

/**
 * Rota legada — contas a pagar vivem na aba "A pagar" do financeiro unificado (Sprint 6).
 */
export default async function AdminContasPagarRedirectPage({ searchParams }: PageProps) {
  const sp = (searchParams ? await searchParams : {}) ?? {}
  const p = new URLSearchParams()
  p.set('tab', 'pagar')
  if (sp.status) p.set('status', sp.status)
  if (sp.periodo) p.set('periodo', sp.periodo)
  redirect(pathWithQuery(ROUTES.admin.financeiro, p))
}
