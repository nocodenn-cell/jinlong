/**
 * FastProduct Admin — Categorias Financeiras (Fase 9)
 *
 * Server Component. Carrega lista de categorias financeiras.
 * Zero query nova — reutiliza actions existentes de /gerente/categorias-financeiras.
 * Abas do hub Loja e equipe (categorias saíram do Financeiro — IA por jornada).
 */

import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/admin-v2'
import { OperationalHubNav } from '@/components/ui/admin-v2/OperationalHubNav'
import { listarCategoriasFinanceiras } from '@/app/gerente/categorias-financeiras/actions'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@/lib/navigation/routes'
import { CategoriasFinanceirasContent } from './_components/CategoriasFinanceirasContent'

type SearchParams = {
  q?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminCategoriasFinanceirasPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.categoriasFinanceiras,
    resource: `route:${ROUTES.admin.categoriasFinanceiras}`,
  })
  const m = getMessages(session.idioma)

  const sp = (await searchParams) ?? {}
  const page = parseInt(sp.page ?? '1', 10)
  const busca = sp.q ?? ''

  const res = await listarCategoriasFinanceiras({
    page,
    pageSize: 50,
    busca,
  })

  const dados = res.success ? res.data : { rows: [], total: 0 }

  return (
    <div className="admin-v2-page">
      <PageHeader
        title={m.admin_ui.financeiro_titulo}
        subtitle={m.categorias_financeiras.subtitulo}
      />

      <OperationalHubNav hub="loja" />

      <Suspense fallback={<div className="admin-v2-panel h-12 animate-pulse rounded-lg" />}>
        <CategoriasFinanceirasContent idioma={session.idioma} dados={dados} />
      </Suspense>
    </div>
  )
}
