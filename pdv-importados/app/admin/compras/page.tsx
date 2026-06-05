/**
 * FastProduct Admin — Compras (Fase 9)
 *
 * Server Component. Carrega lista de compras.
 * Zero query nova — reutiliza actions de /gerente/compras.
 */

import { Suspense } from 'react'
import { listarCompras } from '@/app/gerente/compras/actions'
import { ComprasContent } from './_components/ComprasContent'

type SearchParams = {
  q?: string
  status?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminComprasPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const page = parseInt(sp.page ?? '1', 10)
  const q = sp.q ?? ''
  const status = (sp.status as 'todos' | 'pendente' | 'recebida' | undefined) ?? 'todos'

  const res = await listarCompras({
    page,
    pageSize: 50,
    busca: q,
    status,
  })

  const dados = res.success ? res.data : { rows: [], total: 0 }

  return (
    <div className="flex flex-col">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-[18px] font-semibold text-zinc-100">Compras</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">Gerenciar ordens de compra e recebimentos</p>
        </div>
      </div>

      <Suspense fallback={<div className="h-12 bg-zinc-900" />}>
        <ComprasContent dados={dados} />
      </Suspense>
    </div>
  )
}
