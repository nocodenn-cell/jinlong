/**
 * FastProduct Admin — Categorias Financeiras (Sprint 4 / RFC-UX-016)
 */

import { Suspense } from 'react'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { PageShell } from '@/components/ui/admin-v2'
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

function parseTipo(raw: string | undefined): 'todos' | 'RECEITA' | 'DESPESA' | 'AMBOS' {
  if (raw === 'RECEITA' || raw === 'DESPESA' || raw === 'AMBOS') return raw
  return 'todos'
}

function parseSituacao(raw: string | undefined): 'todos' | 'ativos' | 'inativos' {
  if (raw === 'ativos' || raw === 'inativos') return raw
  return 'todos'
}

export default async function AdminCategoriasFinanceirasPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.categoriasFinanceiras,
    resource: `route:${ROUTES.admin.categoriasFinanceiras}`,
  })
  const m = getMessages(session.idioma)
  const cf = m.categorias_financeiras

  const sp = (await searchParams) ?? {}
  const page = parseInt(sp.page ?? '1', 10)
  const busca = sp.q ?? ''
  const tipo = parseTipo(sp.tipo)
  const situacao = parseSituacao(sp.situacao)

  const res = await listarCategoriasFinanceiras({
    page,
    pageSize: 50,
    busca,
    tipo,
    situacao,
  })

  const dados = res.success ? res.data : { rows: [], total: 0 }

  const filters: FilterDef[] = [
    {
      type: 'search',
      key: 'q',
      placeholder: cf.filtro_busca_placeholder,
      label: cf.filtro_busca,
    },
    {
      type: 'pills',
      key: 'tipo',
      defaultValue: 'todos',
      options: [
        { value: 'todos', label: cf.filtro_todos },
        { value: 'RECEITA', label: cf.tipo_receita },
        { value: 'DESPESA', label: cf.tipo_despesa },
        { value: 'AMBOS', label: cf.tipo_ambos },
      ],
    },
    {
      type: 'pills',
      key: 'situacao',
      defaultValue: 'todos',
      options: [
        { value: 'todos', label: cf.filtro_situacao_todos },
        { value: 'ativos', label: cf.filtro_ativos },
        { value: 'inativos', label: cf.filtro_inativos },
      ],
    },
  ]

  return (
    <PageShell
      title={cf.titulo}
      subtitle={cf.subtitulo}
      filters={
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar filters={filters} clearLabel={m.comum.limpar_filtros} />
        </Suspense>
      }
    >
      <Suspense fallback={<div className="admin-v2-panel h-12 animate-pulse rounded-lg" />}>
        <CategoriasFinanceirasContent
          idioma={session.idioma}
          dados={dados}
          page={page}
        />
      </Suspense>
    </PageShell>
  )
}
