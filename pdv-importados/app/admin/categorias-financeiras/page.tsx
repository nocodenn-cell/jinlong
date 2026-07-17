/**
 * FastProduct Admin — Categorias Financeiras (Fase 9)
 *
 * Server Component. Carrega lista de categorias financeiras.
 * Zero query nova — reutiliza actions existentes de /gerente/categorias-financeiras.
 */

import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/admin-v2'
import { listarCategoriasFinanceiras } from '@/app/gerente/categorias-financeiras/actions'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@shared-core/navigation/routes'
import { CategoriasFinanceirasContent } from './_components/CategoriasFinanceirasContent'

type SearchParams = {
  q?: string
  tipo?: string
  situacao?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

const PAGE_SIZE = 50

export default async function AdminCategoriasFinanceirasPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.categoriasFinanceiras,
    resource: `route:${ROUTES.admin.categoriasFinanceiras}`,
  })
  const m = getMessages(session.idioma).categorias_financeiras

  const sp = (await searchParams) ?? {}
  const page = parseInt(sp.page ?? '1', 10)
  const busca = sp.q ?? ''
  const tipo = (sp.tipo as 'todos' | 'RECEITA' | 'DESPESA' | 'AMBOS' | undefined) ?? 'todos'
  const situacao = (sp.situacao as 'todos' | 'ativos' | 'inativos' | undefined) ?? 'todos'

  const res = await listarCategoriasFinanceiras({
    page,
    pageSize: PAGE_SIZE,
    busca,
    tipo,
    situacao,
  })

  const dados = res.success ? res.data : { rows: [], total: 0 }
  // res.error: falha real de carga (RLS, rede) — distinto de "nenhuma categoria".
  const loadError = res.success ? null : res.error

  return (
    <div className="admin-v2-page">
      <PageHeader title={m.titulo} subtitle={m.subtitulo} />

      <Suspense fallback={<div className="admin-v2-panel h-12 animate-pulse rounded-lg" />}>
        <CategoriasFinanceirasContent
          dados={dados}
          loadError={loadError}
          idioma={session.idioma}
          filtroInicial={{ busca, tipo, situacao, page }}
          pageSize={PAGE_SIZE}
        />
      </Suspense>
    </div>
  )
}
