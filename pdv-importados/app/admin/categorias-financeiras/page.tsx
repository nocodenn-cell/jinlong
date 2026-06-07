/**
 * FastProduct Admin — Categorias Financeiras (Fase 9)
 *
 * Server Component. Carrega lista de categorias financeiras.
 * Zero query nova — reutiliza actions existentes de /gerente/categorias-financeiras.
 */

import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/admin-v2'
import { listarCategoriasFinanceiras } from '@/app/gerente/categorias-financeiras/actions'
import { CategoriasFinanceirasContent } from './_components/CategoriasFinanceirasContent'

type SearchParams = {
  q?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminCategoriasFinanceirasPage({ searchParams }: PageProps) {
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
        title="Categorias Financeiras"
        subtitle="Gerenciar categorias de receitas e despesas"
      />

      <Suspense fallback={<div className="admin-v2-panel h-12 animate-pulse rounded-lg" />}>
        <CategoriasFinanceirasContent dados={dados} />
      </Suspense>
    </div>
  )
}
