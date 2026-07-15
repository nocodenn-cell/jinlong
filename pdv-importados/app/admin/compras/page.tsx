/**
 * FastProduct Admin — Compras (Fase 1 — reconstrução)
 *
 * Server Component no padrão Admin V2 (espelhado de Estoque/Vendas):
 * PageHeader + FilterBar (searchParams como SSoT de filtros) + MetricCards +
 * SectionCard com DataTable e paginação numerada por `?page=`.
 * Reusa as actions do domínio de compras (`./actions`) — nenhuma query nova.
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { MetricCard, PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { formatBRL } from '@/lib/format/money'
import { obterKpisCompras, listarOrdensCompra } from './actions'
import { ComprasClient } from './_components/ComprasClient'

const PAGE_SIZE = 25

// ─── Normalizadores de searchParams ─────────────────────────────────────────

const STATUS_VALUES = ['', 'RASCUNHO', 'CONFIRMADA', 'EM_TRANSITO', 'RECEBIDA', 'CANCELADA'] as const
type StatusFiltro = (typeof STATUS_VALUES)[number]

function oneOf<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback
}

function clampPage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

type SearchParams = {
  q?: string
  status?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminComprasPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.compras,
    resource: `route:${ROUTES.admin.compras}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const c = m.compras
  const sp = (searchParams ? await searchParams : {}) ?? {}

  const q = (sp.q ?? '').slice(0, 200)
  const status = oneOf<StatusFiltro>(sp.status, STATUS_VALUES, '')
  const page = clampPage(sp.page)

  const supabase = await createClient()

  const [kpis, lista, { data: fornecedoresRaw }, { data: produtosRaw }] = await Promise.all([
    obterKpisCompras(),
    listarOrdensCompra({
      status: status === '' ? null : status,
      busca: q,
      limite: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    supabase.from('fornecedores').select('id, nome').eq('ativo', true).order('nome').limit(500),
    supabase.from('produtos').select('id, nome, unidade_medida').eq('ativo', true).order('nome').limit(500),
  ])

  const fornecedores = (fornecedoresRaw ?? []).map((f) => ({ id: f.id, nome: f.nome }))
  const produtos = (produtosRaw ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    unidade_medida: p.unidade_medida ?? 'UN',
  }))

  const totalPages = Math.max(1, Math.ceil(lista.total / PAGE_SIZE))

  const filters: FilterDef[] = [
    { type: 'search', key: 'q', placeholder: c.busca_placeholder },
    {
      type: 'pills',
      key: 'status',
      defaultValue: '',
      options: [
        { value: '', label: c.filtro_todos_status },
        { value: 'RASCUNHO', label: c.status_RASCUNHO },
        { value: 'CONFIRMADA', label: c.status_CONFIRMADA },
        { value: 'EM_TRANSITO', label: c.status_EM_TRANSITO },
        { value: 'RECEBIDA', label: c.status_RECEBIDA },
        { value: 'CANCELADA', label: c.status_CANCELADA },
      ],
    },
  ]

  const activeParams: Record<string, string> = {}
  if (q) activeParams.q = q
  if (status) activeParams.status = status

  const pageHref = (target: number) => {
    const p = new URLSearchParams(activeParams)
    if (target > 1) p.set('page', String(target))
    return pathWithQuery(ROUTES.admin.compras, p)
  }

  const countBadge = (
    <span className="rounded-full border border-[var(--color-border-secondary)] bg-jl-surface-soft px-2.5 py-0.5 text-[11px] text-jl-fg-3">
      {lista.total}
    </span>
  )

  return (
    <div className="admin-v2-page admin-v2-stack">
      <PageHeader title={c.titulo} subtitle={c.subtitulo} />

      <div className="admin-v2-grid-kpi">
        <MetricCard label={c.kpi_rascunho} value={String(kpis.total_rascunho)} icon="list-filter" tone="gold" />
        <MetricCard label={c.kpi_confirmadas} value={String(kpis.total_confirmadas)} icon="file-check-2" tone="gold" />
        <MetricCard
          label={c.kpi_em_transito}
          value={String(kpis.total_em_transito)}
          icon="package"
          tone={kpis.total_em_transito > 0 ? 'warning' : 'gold'}
        />
        <MetricCard
          label={c.kpi_valor_transito}
          value={formatBRL(kpis.valor_em_transito)}
          icon="dollar-sign"
          tone={kpis.valor_em_transito > 0 ? 'warning' : 'gold'}
        />
      </div>

      <div className="border-b border-[var(--color-border-secondary)] pb-3">
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar filters={filters} />
        </Suspense>
      </div>

      <SectionCard title={c.titulo} action={countBadge}>
        <ComprasClient idioma={session.idioma} rows={lista.rows} fornecedores={fornecedores} produtos={produtos} />

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-jl-fg-3">
              {m.produtos.pag_info.replace('{{atual}}', String(page)).replace('{{total}}', String(totalPages))}
            </span>
            <div className="flex items-center gap-1">
              <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
                {ui.paginacao_anterior}
              </PageLink>
              <PageLink href={pageHref(page + 1)} disabled={page >= totalPages}>
                {ui.paginacao_proxima}
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
      <span className="cursor-not-allowed rounded-lg border border-[var(--color-border-secondary)] px-2.5 py-1 text-[11px] text-jl-fg-3 opacity-50">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-[var(--color-border-secondary)] px-2.5 py-1 text-[11px] text-jl-fg-2 transition-colors hover:bg-jl-surface-elev hover:text-jl-fg-1"
    >
      {children}
    </Link>
  )
}
