/**
 * Categorias de Produtos — Sprint 5 / RFC-UX-023: PageShell + FilterBar.
 */

import { Suspense } from 'react'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { PageShell } from '@/components/ui/admin-v2'
import { listarCategoriasProdutos } from '@/app/gerente/categorias-produtos/actions'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@shared-core/navigation/routes'
import { CategoriasProdutosContent } from './_components/CategoriasProdutosContent'

type SearchParams = {
  q?: string
  situacao?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

function parseSituacao(raw: string | undefined): 'todos' | 'ativos' | 'inativos' {
  if (raw === 'ativos' || raw === 'inativos') return raw
  return 'todos'
}

export default async function AdminCategoriasProdutosPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.categoriasProdutos,
    resource: `route:${ROUTES.admin.categoriasProdutos}`,
  })
  const m = getMessages(session.idioma)
  const cp = m.categorias_produtos

  const sp = (await searchParams) ?? {}
  const page = parseInt(sp.page ?? '1', 10)
  const busca = sp.q ?? ''
  const situacao = parseSituacao(sp.situacao)

  const res = await listarCategoriasProdutos({
    page,
    pageSize: 50,
    busca,
    situacao,
  })

  const dados = res.success ? res.data : { rows: [], total: 0 }

  const filters: FilterDef[] = [
    {
      type: 'search',
      key: 'q',
      placeholder: cp.filtro_busca_placeholder,
      label: cp.filtro_busca,
    },
    {
      type: 'pills',
      key: 'situacao',
      defaultValue: 'todos',
      options: [
        { value: 'todos', label: cp.filtro_todos },
        { value: 'ativos', label: cp.filtro_ativos },
        { value: 'inativos', label: cp.filtro_inativos },
      ],
    },
  ]

  return (
    <PageShell
      title={cp.titulo}
      subtitle={cp.cadastro_rapido_hint}
      filters={
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar filters={filters} clearLabel={m.comum.limpar_filtros} />
        </Suspense>
      }
    >
      <Suspense fallback={<div className="admin-v2-panel h-12 animate-pulse rounded-lg" />}>
        <CategoriasProdutosContent idioma={session.idioma} dados={dados} page={page} />
      </Suspense>
    </PageShell>
  )
}
