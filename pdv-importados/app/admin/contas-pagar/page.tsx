/**
 * FastProduct Admin — Contas a Pagar (Fase 9)
 *
 * Server Component. Carrega lista de contas a pagar.
 * Zero query nova — reutiliza functions de /lib/gerente/contaspagarServer.
 */

import { Suspense } from 'react'
import { fetchContasPagarListagem } from '@/lib/gerente/contaspagarServer'
import { ContasPagarContent } from './_components/ContasPagarContent'

type SearchParams = {
  q?: string
  status?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminContasPagarPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const q = sp.q ?? ''
  const status = sp.status ?? 'todos'

  const res = await fetchContasPagarListagem({ q, status, limite: 200 })
  const dados = res.success ? res.data : { rows: [], total: 0, capped: false }

  return (
    <div className="flex flex-col">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-[18px] font-semibold text-zinc-100">Contas a Pagar</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">Gerenciar compromissos financeiros</p>
        </div>
      </div>

      <Suspense fallback={<div className="h-12 bg-zinc-900" />}>
        <ContasPagarContent dados={dados} />
      </Suspense>
    </div>
  )
}
