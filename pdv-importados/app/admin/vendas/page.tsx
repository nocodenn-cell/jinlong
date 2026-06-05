/**
 * FastProduct Admin — Vendas (Fase 5)
 *
 * Server Component. Reusa a action EXISTENTE `buscarVendasPaginadasAction`
 * (`@/app/gerente/vendas/actions`) — nenhuma query nova para a listagem. Os
 * searchParams da URL viram o `VendasFiltro` + a página.
 *
 * Estrutura espelhada do Estoque (Fase 5): FilterBar + DataTable + chips
 * removíveis. DIFERENÇA: a action de origem só expõe `hasMore` (sem total), então
 * a paginação é por CURSOR (Anterior/Próxima), não numerada.
 *
 * Novidade: VendaDetailSheet (única action nova, read-only) aberto por linha.
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { buscarVendasPaginadasAction, type VendasFiltro } from '@/app/gerente/vendas/actions'
import { VendasTable, type VendaLinha } from './_components/VendasTable'

// ─── Normalizadores de searchParams ─────────────────────────────────────────

type Periodo = 'tudo' | 'hoje' | '7d' | '30d'
type StatusFiltro = 'all' | 'CONCLUIDA' | 'CANCELADA'
type PagamentoFiltro = 'all' | 'DINHEIRO' | 'PIX' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'CARTAO'

function oneOf<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback
}

function clampPage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

const DIA_MS = 86_400_000

/** Início do período (ISO) ou null para "tudo". `fim` fica em aberto (sem vendas futuras). */
function periodoInicio(periodo: Periodo): string | null {
  const now = new Date()
  if (periodo === 'hoje') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  if (periodo === '7d') return new Date(now.getTime() - 7 * DIA_MS).toISOString()
  if (periodo === '30d') return new Date(now.getTime() - 30 * DIA_MS).toISOString()
  return null
}

const PERIODO_LABEL: Record<Exclude<Periodo, 'tudo'>, string> = {
  hoje: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
}
const STATUS_LABEL: Record<Exclude<StatusFiltro, 'all'>, string> = {
  CONCLUIDA: 'Concluídas',
  CANCELADA: 'Canceladas',
}
const PAGAMENTO_LABEL: Record<Exclude<PagamentoFiltro, 'all'>, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO_CREDITO: 'Cartão crédito',
  CARTAO_DEBITO: 'Cartão débito',
  CARTAO: 'Cartão',
}

type SearchParams = {
  periodo?: string
  status?: string
  pagamento?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminVendasPage({ searchParams }: PageProps) {
  const sp = (searchParams ? await searchParams : {}) ?? {}

  const periodo = oneOf<Periodo>(sp.periodo, ['tudo', 'hoje', '7d', '30d'], 'tudo')
  const status = oneOf<StatusFiltro>(sp.status, ['all', 'CONCLUIDA', 'CANCELADA'], 'all')
  const pagamento = oneOf<PagamentoFiltro>(
    sp.pagamento,
    ['all', 'DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'CARTAO'],
    'all'
  )
  const page = clampPage(sp.page)

  const filtros: VendasFiltro = {
    inicio: periodoInicio(periodo),
    fim: null,
    status: status === 'all' ? [] : [status],
    formaPagamento: pagamento === 'all' ? [] : [pagamento],
  }

  // ─── Dados (action EXISTENTE — nenhuma query nova) ───────────────────────
  const res = await buscarVendasPaginadasAction(page, filtros)
  const vendas: VendaLinha[] = res.ok
    ? res.vendas.map((v) => ({
        id: v.id,
        data: v.data,
        total_liquido: v.total_liquido,
        forma_pagamento: v.forma_pagamento,
        status: v.status,
        qtd_itens_total: v.qtd_itens_total,
        qtd_itens_distintos: v.qtd_itens_distintos,
        primeiro_produto: v.primeiro_produto,
      }))
    : []
  const hasMore = res.ok ? res.hasMore : false
  const loadError = res.ok ? null : res.error

  // ─── FilterBar (Fase 2) ──────────────────────────────────────────────────
  const filters: FilterDef[] = [
    {
      type: 'pills',
      key: 'periodo',
      defaultValue: 'tudo',
      options: [
        { value: 'tudo', label: 'Tudo' },
        { value: 'hoje', label: 'Hoje' },
        { value: '7d', label: '7 dias' },
        { value: '30d', label: '30 dias' },
      ],
    },
    {
      type: 'pills',
      key: 'status',
      defaultValue: 'all',
      options: [
        { value: 'all', label: 'Todas' },
        { value: 'CONCLUIDA', label: 'Concluídas' },
        { value: 'CANCELADA', label: 'Canceladas' },
      ],
    },
    {
      type: 'select',
      key: 'pagamento',
      label: 'Forma de pagamento',
      defaultValue: 'all',
      options: [
        { value: 'all', label: 'Todas as formas' },
        { value: 'DINHEIRO', label: 'Dinheiro' },
        { value: 'PIX', label: 'PIX' },
        { value: 'CARTAO_CREDITO', label: 'Cartão crédito' },
        { value: 'CARTAO_DEBITO', label: 'Cartão débito' },
        { value: 'CARTAO', label: 'Cartão' },
      ],
    },
  ]

  // ─── Chips de filtros ativos (server-side, removíveis) ───────────────────
  const activeParams: Record<string, string> = {}
  if (periodo !== 'tudo') activeParams.periodo = periodo
  if (status !== 'all') activeParams.status = status
  if (pagamento !== 'all') activeParams.pagamento = pagamento

  const hrefWithout = (key: string) => {
    const p = new URLSearchParams(activeParams)
    p.delete(key)
    p.delete('page')
    const qs = p.toString()
    return qs ? `/admin/vendas?${qs}` : '/admin/vendas'
  }
  const pageHref = (target: number) => {
    const p = new URLSearchParams(activeParams)
    if (target > 1) p.set('page', String(target))
    const qs = p.toString()
    return qs ? `/admin/vendas?${qs}` : '/admin/vendas'
  }

  const chips: Array<{ key: string; label: string }> = []
  if (periodo !== 'tudo') chips.push({ key: 'periodo', label: PERIODO_LABEL[periodo] })
  if (status !== 'all') chips.push({ key: 'status', label: STATUS_LABEL[status] })
  if (pagamento !== 'all') chips.push({ key: 'pagamento', label: `Pagamento: ${PAGAMENTO_LABEL[pagamento]}` })

  return (
    <div className="flex flex-col">
      {/* Cabeçalho + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-[18px] font-semibold text-zinc-100">Vendas</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">Histórico de vendas e detalhe por pedido</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Href transitório → /gerente enquanto a rota /admin não tem export próprio */}
          <Link href="/gerente/vendas" className="fp-btn fp-btn--secondary">
            <Download size={14} aria-hidden />
            Exportar CSV
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="border-b border-zinc-800 px-6 py-3">
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar filters={filters} />
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
        <span className="text-[13px] font-medium text-zinc-300">Lista de vendas</span>
        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-[11px] text-zinc-500">
          {vendas.length} {vendas.length === 1 ? 'venda' : 'vendas'} nesta página
        </span>
      </div>

      {loadError ? (
        <div className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-300">
          {loadError}
        </div>
      ) : null}

      <VendasTable vendas={vendas} />

      {/* Paginação por cursor (server-side via URL) */}
      {page > 1 || hasMore ? (
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          <span className="text-[11px] text-zinc-600">Página {page}</span>
          <div className="flex items-center gap-1">
            <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
              ‹ Anterior
            </PageLink>
            <PageLink href={pageHref(page + 1)} disabled={!hasMore}>
              Próxima ›
            </PageLink>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── Paginação: link (espelha o Estoque/Catálogo) ───────────────────────────

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string
  disabled: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-lg border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-700">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
    >
      {children}
    </Link>
  )
}
