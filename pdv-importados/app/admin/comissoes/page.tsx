/**
 * FastProduct Admin — Comissões (Fase 8)
 *
 * Server Component. Reutiliza action `carregarResumoComissoes` de /gerente/comissoes.
 * Passa para client component que renderiza tabela com detalhe modal.
 *
 * Zero query nova — reutiliza RPCs existentes de /gerente/comissoes.
 */

import { Suspense } from 'react'
import { carregarResumoComissoes } from '@/app/gerente/comissoes/actions'
import { ComissoesContent } from './_components/ComissoesContent'

type SearchParams = {
  de?: string
  ate?: string
  status?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

const TODAY = new Date().toISOString().slice(0, 10)
const TRINTA_DIAS_ATRAS = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10)

export default async function AdminComissoesPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const de = sp.de ?? TRINTA_DIAS_ATRAS
  const ate = sp.ate ?? TODAY
  const status = (sp.status as 'todos' | 'pendente' | 'pago' | undefined) ?? 'todos'

  const res = await carregarResumoComissoes({
    de,
    ate,
    status,
  })

  const dados = res.success ? res.data : []

  return (
    <div className="flex flex-col">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-[18px] font-semibold text-zinc-100">Comissões</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">Acompanhar comissões por operador</p>
        </div>
      </div>

      <Suspense fallback={<div className="h-12 bg-zinc-900" />}>
        <ComissoesContent dados={dados} filtroInicial={{ de, ate, status }} />
      </Suspense>
    </div>
  )
}
