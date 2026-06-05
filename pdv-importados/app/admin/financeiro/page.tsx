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
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import {
  fetchContasReceberListagem,
  fetchFinanceiroTitulosKpis,
  parseTituloFiltersFromSearchParams,
} from '@/lib/gerente/financeiroTitulosServer'
import { formatBRL } from '@/lib/format/money'
import { ContasReceberTable, type ContaLinha } from './_components/ContasReceberTable'

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

  // ─── Dados (funções EXISTENTES — nenhuma query nova) ───────────────────
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

  // ─── FilterBar (Fase 2) ──────────────────────────────────────────────────
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

  // ─── Chips de filtros ativos ─────────────────────────────────────────────
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
    <div className="flex flex-col">
      {/* Cabeçalho + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-[18px] font-semibold text-zinc-100">Financeiro</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">Contas a receber e histórico de liquidações</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/gerente/financeiro" className="fp-btn fp-btn--primary">
            <Plus size={14} aria-hidden />
            Nova conta
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <div className="grid grid-cols-3 gap-4">
          <div
            className="rounded-[10px] p-3"
            style={{ background: 'var(--fp-bg-secondary)', border: '1px solid var(--fp-border)' }}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--fp-text-muted)' }}>
              Contas abertas
            </p>
            <p className="mt-1.5 text-[20px] font-semibold" style={{ color: 'var(--fp-text-primary)' }}>
              {kpisRes.titulosAbertosCount}
            </p>
          </div>
          <div
            className="rounded-[10px] p-3"
            style={{ background: 'var(--fp-bg-secondary)', border: '1px solid var(--fp-border)' }}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--fp-text-muted)' }}>
              Valor aberto
            </p>
            <p className="mt-1.5 truncate text-[18px] font-semibold" style={{ color: 'var(--fp-text-primary)' }}>
              {formatBRL(kpisRes.valorAbertoTotal)}
            </p>
            {kpisRes.kpiValorTruncado ? (
              <p className="mt-0.5 text-[10px]" style={{ color: 'var(--fp-text-muted)' }}>
                (aprox.; capped em {kpisRes.titulosAbertosCount} itens)
              </p>
            ) : null}
          </div>
          <div
            className="rounded-[10px] p-3"
            style={{ background: 'var(--fp-bg-secondary)', border: '1px solid var(--fp-border)' }}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--fp-text-muted)' }}>
              Filtros aplicados
            </p>
            <p className="mt-1.5 text-[18px] font-semibold" style={{ color: 'var(--fp-text-primary)' }}>
              {listaRes.capped ? `${contas.length}+` : contas.length}
            </p>
            {listaRes.capped ? (
              <p className="mt-0.5 text-[10px]" style={{ color: 'var(--fp-text-muted)' }}>
                (resultado truncado)
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="border-b border-zinc-800 px-6 py-3">
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar filters={filterDefs} />
        </Suspense>

        {chips.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <Link
                key={chip.key}
                href={hrefWithout(chip.key)}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-[11px] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
              >
                {chip.label}
                <span aria-hidden className="text-zinc-500">
                  ✕
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {/* Contador */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-2.5">
        <span className="text-[13px] font-medium text-zinc-300">Contas a receber</span>
        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-[11px] text-zinc-500">
          {listaRes.capped ? `${contas.length}+ registros` : `${contas.length} ${contas.length === 1 ? 'registro' : 'registros'}`}
        </span>
      </div>

      <ContasReceberTable contas={contas} />
    </div>
  )
}
