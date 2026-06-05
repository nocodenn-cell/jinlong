/**
 * FastProduct Admin — Categorias Financeiras (Fase 9)
 *
 * Server Component. Carrega lista de categorias financeiras.
 * Zero query nova — reutiliza actions existentes de /gerente/categorias-financeiras.
 */

import { Suspense } from 'react'
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
    <div className="flex flex-col">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-[18px] font-semibold text-zinc-100">Categorias Financeiras</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">Gerenciar categorias de receitas e despesas</p>
        </div>
      </div>

      <Suspense fallback={<div className="h-12 bg-zinc-900" />}>
        <CategoriasFinanceirasContent dados={dados} />
      </Suspense>
    </div>
  )
}
