/**
 * Marcas de Produtos — Sprint 5 / RFC-UX-023: PageShell + FilterBar.
 */

import { Suspense } from 'react'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { PageShell } from '@/components/ui/admin-v2'
import { listarMarcasProdutos } from '@/app/gerente/marcas-produtos/actions'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@shared-core/navigation/routes'
import { MarcasProdutosContent } from './_components/MarcasProdutosContent'

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

export default async function AdminMarcasProdutosPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.marcasProdutos,
    resource: `route:${ROUTES.admin.marcasProdutos}`,
  })
  const m = getMessages(session.idioma)
  const mp = m.marcas_produtos

  const sp = (await searchParams) ?? {}
  const pageRaw = Number.parseInt(sp.page ?? '1', 10)
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1
  const busca = sp.q ?? ''
  const situacao = parseSituacao(sp.situacao)

  const res = await listarMarcasProdutos({ page, pageSize: 50, busca, situacao })
  const dados = res.success ? res.data : { rows: [], total: 0 }

  const filters: FilterDef[] = [
    {
      type: 'search',
      key: 'q',
      placeholder: mp.filtro_busca_placeholder,
      label: mp.filtro_busca,
    },
    {
      type: 'pills',
      key: 'situacao',
      defaultValue: 'todos',
      options: [
        { value: 'todos', label: mp.filtro_todos },
        { value: 'ativos', label: mp.filtro_ativos },
        { value: 'inativos', label: mp.filtro_inativos },
      ],
    },
  ]

  return (
    <PageShell
      title={mp.titulo}
      subtitle={mp.cadastro_rapido_hint}
      filters={
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar filters={filters} clearLabel={m.comum.limpar_filtros} />
        </Suspense>
      }
    >
      <Suspense fallback={<div className="admin-v2-panel h-12 animate-pulse rounded-lg" />}>
        <MarcasProdutosContent idioma={session.idioma} dados={dados} page={page} />
      </Suspense>
    </PageShell>
  )
}
