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

import Link from 'next/link'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { MetricCard, PageHeader, SectionCard } from '@/components/ui/admin-v2'
import type { MetricCardIconKey } from '@/components/ui/admin-v2/MetricCard'
import { buscarVendasPaginadasAction, type VendasFiltro } from '@/app/gerente/vendas/actions'
import { formatBRL, formatNumberLocale } from '@/lib/format/money'
import { VendasTable, type VendaLinha } from './_components/VendasTable'

// ─── Normalizadores de searchParams ─────────────────────────────────────────

type Periodo = 'tudo' | 'hoje' | 'ontem' | '7d' | 'mes'
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

function periodoInicio(periodo: Periodo): string | null {
  const now = new Date()
  if (periodo === 'hoje') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  if (periodo === 'ontem') {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  if (periodo === '7d') return new Date(now.getTime() - 7 * DIA_MS).toISOString()
  if (periodo === 'mes') {
    const d = new Date(now)
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  return null
}

function periodoFim(periodo: Periodo): string | null {
  const now = new Date()
  if (periodo !== 'ontem') return null
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

const PERIODO_LABEL: Record<Exclude<Periodo, 'tudo'>, string> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  '7d': 'Últimos 7 dias',
  mes: 'Mês atual',
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

  const periodo = oneOf<Periodo>(sp.periodo, ['tudo', 'hoje', 'ontem', '7d', 'mes'], 'hoje')
  const status = oneOf<StatusFiltro>(sp.status, ['all', 'CONCLUIDA', 'CANCELADA'], 'all')
  const pagamento = oneOf<PagamentoFiltro>(
    sp.pagamento,
    ['all', 'DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'CARTAO'],
    'all'
  )
  const page = clampPage(sp.page)

  const filtros: VendasFiltro = {
    inicio: periodoInicio(periodo),
    fim: periodoFim(periodo),
    status: status === 'all' ? [] : [status],
    formaPagamento: pagamento === 'all' ? [] : [pagamento],
  }

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

  const kpis = vendas.reduce(
    (acc, row) => {
      const valor = Number(row.total_liquido ?? 0)
      const statusRow = String(row.status ?? '').toUpperCase()
      if (statusRow === 'CONCLUIDA') {
        acc.faturado += valor
        acc.qtdConcluidas += 1
      } else if (statusRow === 'CANCELADA') {
        acc.qtdCanceladas += 1
        acc.valorCanceladas += valor
      }
      return acc
    },
    { faturado: 0, qtdConcluidas: 0, qtdCanceladas: 0, valorCanceladas: 0 }
  )
  const ticketMedio = kpis.qtdConcluidas > 0 ? kpis.faturado / kpis.qtdConcluidas : 0

  const activeParams: Record<string, string> = {}
  if (periodo !== 'hoje') activeParams.periodo = periodo
  if (status !== 'all') activeParams.status = status
  if (pagamento !== 'all') activeParams.pagamento = pagamento

  const hrefWithout = (key: string) => {
    const p = new URLSearchParams(activeParams)
    p.delete(key)
    p.delete('page')
    return pathWithQuery(ROUTES.admin.vendas, p)
  }
  const pageHref = (target: number) => {
    const p = new URLSearchParams(activeParams)
    if (target > 1) p.set('page', String(target))
    return pathWithQuery(ROUTES.admin.vendas, p)
  }

  const chips: Array<{ key: string; label: string }> = []
  if (periodo !== 'tudo') chips.push({ key: 'periodo', label: PERIODO_LABEL[periodo] })
  if (status !== 'all') chips.push({ key: 'status', label: STATUS_LABEL[status] })
  if (pagamento !== 'all') chips.push({ key: 'pagamento', label: `Pagamento: ${PAGAMENTO_LABEL[pagamento]}` })

  const periodOptions: Array<{ id: Periodo; label: string }> = [
    { id: 'hoje', label: 'Hoje' },
    { id: 'ontem', label: 'Ontem' },
    { id: '7d', label: '7d' },
    { id: 'mes', label: 'Mês' },
    { id: 'tudo', label: 'Tudo' },
  ]

  const periodHref = (next: Periodo) => {
    const p = new URLSearchParams(activeParams)
    if (next === 'hoje') p.delete('periodo')
    else p.set('periodo', next)
    p.delete('page')
    return pathWithQuery(ROUTES.admin.vendas, p)
  }

  const metricCards: Array<{
    label: string
    value: string
    icon: MetricCardIconKey
    tone: 'gold' | 'success' | 'warning'
    hint?: string
  }> = [
    {
      label: 'Faturado',
      value: formatBRL(kpis.faturado),
      icon: 'dollar-sign',
      tone: 'gold',
    },
    {
      label: 'Concluídas',
      value: formatNumberLocale(kpis.qtdConcluidas, 'pt-BR'),
      icon: 'shopping-bag',
      tone: 'success',
    },
    {
      label: 'Ticket médio',
      value: formatBRL(ticketMedio),
      icon: 'package',
      tone: 'gold',
    },
    {
      label: 'Canceladas',
      value: formatNumberLocale(kpis.qtdCanceladas, 'pt-BR'),
      icon: 'x-circle',
      tone: 'warning',
      hint: formatBRL(kpis.valorCanceladas),
    },
  ]

  return (
    <div className="admin-v2-page admin-v2-stack">
      <PageHeader
        title="Vendas e caixa"
        subtitle="Acompanhamento consolidado das vendas por período"
        filters={(
          <div className="admin-v2-segmented">
            {periodOptions.map((option) => (
              <Link
                key={option.id}
                href={periodHref(option.id)}
                data-active={periodo === option.id}
                className="admin-v2-filter-pill rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              >
                {option.label}
              </Link>
            ))}
          </div>
        )}
      />

      <div className="admin-v2-grid-kpi">
        {metricCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            tone={card.tone}
            hint={card.hint}
          />
        ))}
      </div>

      <SectionCard
        title="Vendas do dia"
        action={
          <span className="rounded-full border border-[#242424] bg-[#0f0f0f] px-2.5 py-0.5 text-[11px] text-jl-fg-3">
            {vendas.length} {vendas.length === 1 ? 'venda' : 'vendas'} nesta página
          </span>
        }
      >
        {chips.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
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

        {loadError ? (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[12px] text-destructive">
            {loadError}
          </div>
        ) : null}

        <VendasTable vendas={vendas} />

        {page > 1 || hasMore ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-jl-fg-3">Página {page}</span>
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
      </SectionCard>
    </div>
  )
}

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
      <span className="cursor-not-allowed rounded-lg border border-[#242424] px-2.5 py-1 text-[11px] text-jl-fg-3 opacity-50">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-[#242424] px-2.5 py-1 text-[11px] text-jl-fg-2 transition-colors hover:bg-[#161616] hover:text-jl-fg-1"
    >
      {children}
    </Link>
  )
}
