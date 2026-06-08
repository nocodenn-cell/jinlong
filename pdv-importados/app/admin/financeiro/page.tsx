/**
 * FastProduct Admin — Financeiro (Fase 6)
 *
 * Server Component. Reusa `fetchContasReceberListagem` e `fetchFinanceiroTitulosKpis`
 * (`@/lib/gerente/financeiroTitulosServer`) — nenhuma query nova. Os searchParams da
 * URL viram os filtros (status, cliente, busca, período).
 *
 * Estrutura espelhada do Estoque/Vendas: FilterBar + DataTable + chips removíveis.
 * Sem paginação numerada (a query é limitada a `limite`); reutiliza a API de filtros
 * existente. KPIs no topo.
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { DollarSign, FileCheck2, ListFilter, WalletCards } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { MetricCard, PageHeader } from '@/components/ui/admin-v2'
import {
  fetchContasReceberListagem,
  fetchFinanceiroTitulosKpis,
  parseTituloFiltersFromSearchParams,
} from '@/lib/gerente/financeiroTitulosServer'
import { formatBRL } from '@/lib/format/money'
import { type ContaLinha } from './_components/ContasReceberTable'
import { FinanceiroPanels } from './_components/FinanceiroPanels'

type SearchParams = {
  opcao?: string
  cliente?: string
  q?: string
  de?: string
  ate?: string
  limite?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminFinanceiroPage({ searchParams }: PageProps) {
  const sp = (searchParams ? await searchParams : {}) ?? {}
  const parsed = parseTituloFiltersFromSearchParams(sp as Record<string, string | string[] | undefined>)
  const { limite, ...filters } = parsed

  const supabase = await createClient()
  const [listaRes, kpisRes] = await Promise.all([
    fetchContasReceberListagem(supabase, filters, limite),
    fetchFinanceiroTitulosKpis(supabase),
  ])

  const contas: ContaLinha[] = listaRes.titulos.map((t) => ({
    id: t.id,
    cliente_nome: t.cliente_nome ?? '—',
    valor_total: t.valor_total,
    valor_aberto: t.valor_aberto,
    valor_pago: t.valor_total - t.valor_aberto,
    status: t.status,
    vencimento: t.vencimento,
    descricao: t.descricao,
  }))

  const filterDefs: FilterDef[] = [
    {
      type: 'search',
      key: 'q',
      placeholder: 'Descrição ou cliente…',
    },
    {
      type: 'pills',
      key: 'opcao',
      defaultValue: 'mix',
      options: [
        { value: 'mix', label: 'Aberto/Parcial' },
        { value: 'ABERTO', label: 'Só aberto' },
        { value: 'PARCIAL', label: 'Só parcial' },
      ],
    },
  ]

  const activeParams: Record<string, string> = {}
  if (filters.q) activeParams.q = filters.q
  if (filters.opcao !== 'mix') activeParams.opcao = filters.opcao
  if (filters.nomeCliente) activeParams.cliente = filters.nomeCliente
  if (filters.de) activeParams.de = filters.de
  if (filters.ate) activeParams.ate = filters.ate

  const hrefWithout = (key: string) => {
    const p = new URLSearchParams(activeParams)
    p.delete(key)
    const qs = p.toString()
    return qs ? `/admin/financeiro?${qs}` : '/admin/financeiro'
  }

  const statusLabel: Record<string, string> = {
    ABERTO: 'Só aberto',
    PARCIAL: 'Só parcial',
  }

  const chips: Array<{ key: string; label: string }> = []
  if (filters.nomeCliente) chips.push({ key: 'cliente', label: `Cliente: ${filters.nomeCliente}` })
  if (filters.de) chips.push({ key: 'de', label: `De: ${filters.de}` })
  if (filters.ate) chips.push({ key: 'ate', label: `Até: ${filters.ate}` })
  if (filters.opcao !== 'mix') chips.push({ key: 'opcao', label: statusLabel[filters.opcao] ?? filters.opcao })

  return (
    <div className="admin-v2-page">
      <PageHeader
        title="Financeiro e fiscal"
        subtitle="Contas a receber, fila fiscal e controle de emissao"
        filters={
          <Link href="/gerente/financeiro" className="admin-v2-btn-primary">
            Abrir modulo completo
          </Link>
        }
      />

      <div className="admin-v2-stack">
        <div className="admin-v2-grid-kpi">
          <MetricCard
            label="Titulos em aberto"
            value={String(kpisRes.titulosAbertosCount)}
            icon={WalletCards}
            tone="gold"
          />
          <MetricCard
            label="Valor aberto"
            value={formatBRL(kpisRes.valorAbertoTotal)}
            icon={DollarSign}
            tone="gold"
            hint={
              kpisRes.kpiValorTruncado
                ? `(aprox.; capped em ${kpisRes.titulosAbertosCount} itens)`
                : undefined
            }
          />
          <MetricCard
            label="Registros filtrados"
            value={listaRes.capped ? `${contas.length}+` : String(contas.length)}
            icon={ListFilter}
            tone="gold"
            hint={listaRes.capped ? '(resultado truncado)' : undefined}
          />
          <MetricCard
            label="Documentos fiscais"
            value="3 pendentes"
            icon={FileCheck2}
            tone="warning"
            hint="placeholder visual"
          />
        </div>

        <div className="border-b border-[#242424] pb-3">
          <Suspense fallback={<div className="h-9" />}>
            <FilterBar filters={filterDefs} />
          </Suspense>

          {chips.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {chips.map((chip) => (
                <Link key={chip.key} href={hrefWithout(chip.key)} className="admin-v2-chip">
                  {chip.label}
                  <span aria-hidden className="text-jl-fg-3">
                    ✕
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <FinanceiroPanels contas={contas} />
      </div>
    </div>
  )
}
