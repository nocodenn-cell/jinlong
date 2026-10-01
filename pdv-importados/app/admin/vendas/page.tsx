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
import { Suspense } from 'react'
import { ROUTES, pathWithQuery } from '@/lib/navigation/routes'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { createClient } from '@/lib/supabase/server'
import { MetricCard, PageHeader, PeriodFilter, periodoLabelsAdmin, SectionCard } from '@/components/ui/admin-v2'
import type { MetricCardIconKey } from '@/components/ui/admin-v2/MetricCard'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { buscarVendasPaginadasAction, obterKpisVendas, type VendasFiltro } from '@/app/gerente/vendas/actions'
import { formatBRL, formatNumberLocale } from '@/lib/format/money'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { VendasTable, type VendaLinha } from './_components/VendasTable'
import { ExportVendasButton } from './_components/ExportVendasButton'
import { PERIODOS, periodoFim, periodoInicio, periodoMultiDia, type Periodo } from './periodo'

// ─── Normalizadores de searchParams ─────────────────────────────────────────

type StatusFiltro = 'all' | 'CONCLUIDA' | 'CANCELADA'
type PagamentoFiltro = 'all' | 'DINHEIRO' | 'PIX' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'CARTAO'

function oneOf<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback
}

function clampPage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

type SearchParams = {
  periodo?: string
  status?: string
  pagamento?: string
  page?: string
  /** Deep-link (ex.: Relatórios) — abre o detalhe desta venda ao carregar. */
  venda?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminVendasPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.vendas,
    resource: `route:${ROUTES.admin.vendas}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const locale = localeFromIdioma(session.idioma)
  const sp = (searchParams ? await searchParams : {}) ?? {}

  const periodo = oneOf<Periodo>(sp.periodo, PERIODOS, 'hoje')
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

  // KPIs vêm de agregação no servidor (todo o período), não da página listada.
  const [res, kpis] = await Promise.all([
    buscarVendasPaginadasAction(page, filtros),
    obterKpisVendas(filtros),
  ])
  const vendasRes = res.ok ? res.vendas : []

  const operadorIds = Array.from(
    new Set(vendasRes.map((v) => v.operador_id).filter((id): id is string => Boolean(id))),
  )
  const nomeOperadorPorId = new Map<string, string>()
  if (operadorIds.length > 0) {
    const supabase = await createClient()
    const { data: usuariosRaw } = await supabase.from('usuarios').select('id, nome').in('id', operadorIds)
    for (const u of usuariosRaw ?? []) nomeOperadorPorId.set(u.id, u.nome)
  }

  const vendas: VendaLinha[] = vendasRes.map((v) => ({
    id: v.id,
    data: v.data,
    total_liquido: v.total_liquido,
    total_bruto: v.total_bruto,
    forma_pagamento: v.forma_pagamento,
    status: v.status,
    caixa_id: v.caixa_id,
    operador_id: v.operador_id,
    qtd_itens_total: v.qtd_itens_total,
    qtd_itens_distintos: v.qtd_itens_distintos,
    primeiro_produto: v.primeiro_produto,
    vendedor_nome: v.operador_id ? nomeOperadorPorId.get(v.operador_id) ?? null : null,
  }))
  const hasMore = res.ok ? res.hasMore : false
  const loadError = res.ok ? null : res.error

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

  const PERIODO_LABEL_I18N: Record<Exclude<Periodo, 'tudo'>, string> = {
    hoje: ui.vendas_periodo_label_hoje,
    ontem: ui.vendas_periodo_label_ontem,
    '7d': ui.vendas_periodo_label_7d,
    '30d': ui.vendas_periodo_label_30d,
    mes: ui.vendas_periodo_label_mes,
  }
  const STATUS_LABEL_I18N: Record<Exclude<StatusFiltro, 'all'>, string> = {
    CONCLUIDA: ui.vendas_concluidas,
    CANCELADA: ui.vendas_canceladas,
  }
  const PAGAMENTO_LABEL_I18N: Record<Exclude<PagamentoFiltro, 'all'>, string> = {
    DINHEIRO: m.gerente.pagamento_dinheiro,
    PIX: m.gerente.pagamento_pix,
    CARTAO_CREDITO: m.gerente.forma_cartao_credito,
    CARTAO_DEBITO: m.gerente.forma_cartao_debito,
    CARTAO: m.gerente.pagamento_cartao,
  }
  const chips: Array<{ key: string; label: string }> = []
  if (periodo !== 'hoje' && periodo !== 'tudo') chips.push({ key: 'periodo', label: PERIODO_LABEL_I18N[periodo] })
  if (status !== 'all') chips.push({ key: 'status', label: STATUS_LABEL_I18N[status] })
  if (pagamento !== 'all') chips.push({ key: 'pagamento', label: `${m.gerente.col_forma}: ${PAGAMENTO_LABEL_I18N[pagamento]}` })

  // Controles de status/pagamento: as chips acima já permitem remover, mas
  // faltava UI para ATIVAR esses dois filtros (só davam pra setar editando a
  // URL na mão). O período continua nos pills do PageHeader (já funcionava).
  const statusPagamentoFilters: FilterDef[] = [
    {
      type: 'select',
      key: 'status',
      label: m.gerente.col_status,
      showLabel: true,
      defaultValue: 'all',
      options: [
        { value: 'all', label: ui.filtro_todos },
        { value: 'CONCLUIDA', label: STATUS_LABEL_I18N.CONCLUIDA },
        { value: 'CANCELADA', label: STATUS_LABEL_I18N.CANCELADA },
      ],
    },
    {
      type: 'select',
      key: 'pagamento',
      label: m.gerente.col_forma,
      showLabel: true,
      defaultValue: 'all',
      options: [
        { value: 'all', label: ui.filtro_todos },
        { value: 'DINHEIRO', label: PAGAMENTO_LABEL_I18N.DINHEIRO },
        { value: 'PIX', label: PAGAMENTO_LABEL_I18N.PIX },
        { value: 'CARTAO_CREDITO', label: PAGAMENTO_LABEL_I18N.CARTAO_CREDITO },
        { value: 'CARTAO_DEBITO', label: PAGAMENTO_LABEL_I18N.CARTAO_DEBITO },
        { value: 'CARTAO', label: PAGAMENTO_LABEL_I18N.CARTAO },
      ],
    },
  ]

  const periodOptions: readonly Periodo[] = ['hoje', 'ontem', '7d', '30d', 'mes', 'tudo']
  const periodLabels = periodoLabelsAdmin(ui)

  const periodHref = (next: Periodo) => {
    const p = new URLSearchParams(activeParams)
    if (next === 'hoje') p.delete('periodo')
    else p.set('periodo', next)
    p.delete('page')
    return pathWithQuery(ROUTES.admin.vendas, p)
  }

  const emptyActions = (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
      {chips.length > 0 || periodo !== 'hoje' ? (
        <PageLink href={pathWithQuery(ROUTES.admin.vendas, new URLSearchParams())} disabled={false}>
          {ui.vendas_limpar_filtros}
        </PageLink>
      ) : null}
      {periodo !== '7d' ? (
        <PageLink href={periodHref('7d')} disabled={false}>
          {ui.vendas_ver_7d}
        </PageLink>
      ) : null}
    </div>
  )

  const metricCards: Array<{
    label: string
    value: string
    icon: MetricCardIconKey
    tone: 'gold' | 'success' | 'warning'
    hint?: string
  }> = [
    {
      label: ui.vendas_faturado,
      value: formatBRL(kpis.faturado),
      icon: 'dollar-sign',
      tone: 'gold',
    },
    {
      label: ui.vendas_concluidas,
      value: formatNumberLocale(kpis.qtdConcluidas, locale),
      icon: 'shopping-bag',
      tone: 'success',
    },
    {
      label: m.gerente.ticket_medio,
      value: formatBRL(kpis.ticketMedio),
      icon: 'package',
      tone: 'gold',
    },
    {
      label: ui.vendas_canceladas,
      value: formatNumberLocale(kpis.qtdCanceladas, locale),
      icon: 'x-circle',
      tone: 'warning',
      hint: kpis.qtdCanceladas > 0 ? formatBRL(kpis.valorCanceladas) : undefined,
    },
  ]

  return (
    <div className="admin-v2-page admin-v2-stack">
      <PageHeader
        title={m.gerente.nav_topico_vendas_caixa}
        subtitle={ui.vendas_subtitulo}
        filters={(
          <PeriodFilter options={periodOptions} active={periodo} labels={periodLabels} hrefFor={periodHref} />
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
        title={periodo === 'hoje' ? m.dashboard.vendas_hoje : ui.vendas_titulo_periodo}
        action={
          <div className="flex items-center gap-2">
          <ExportVendasButton
            filtros={filtros}
            disabled={vendas.length === 0}
            labels={{ exportar: ui.vendas_exportar_csv, exportando: ui.vendas_exportando, erro: ui.vendas_exportar_erro }}
          />
          <span className="rounded-full border border-[var(--color-border-secondary)] bg-jl-surface-soft px-2.5 py-0.5 text-caption text-jl-fg-3">
            {vendas.length} {vendas.length === 1 ? ui.vendas_nesta_pag_sg : ui.vendas_nesta_pag_pl}
          </span>
          </div>
        }
      >
        <div className="mb-3">
          <Suspense fallback={<div className="h-8" />}>
            <FilterBar filters={statusPagamentoFilters} clearable={false} resetPageOnChange />
          </Suspense>
        </div>

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
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-small text-destructive">
            {loadError}
          </div>
        ) : null}

        <VendasTable vendas={vendas} m={m} locale={locale} vendaInicial={sp.venda ?? null} mostrarData={periodoMultiDia(periodo)} emptyActions={emptyActions} labels={{
          colVenda: ui.vendas_col_venda,
          colHora: ui.vendas_col_hora,
          colItens: ui.vendas_col_itens,
          colPagamento: m.gerente.col_forma,
          colTotal: m.gerente.col_total,
          colStatus: m.gerente.col_status,
          colVendedor: ui.vendas_col_vendedor,
          concluida: m.gerente.venda_status_concluida,
          cancelada: m.gerente.venda_status_cancelada,
          unidade: ui.vendas_unidade,
          unidades: ui.vendas_unidades,
          item: ui.vendas_item,
          itensPl: ui.vendas_itens_pl,
          pagDinheiro: m.gerente.pagamento_dinheiro,
          pagPix: m.gerente.pagamento_pix,
          pagCredito: ui.vendas_pag_label_credito,
          pagDebito: ui.vendas_pag_label_debito,
          pagCartao: ui.vendas_pag_label_cartao,
          pagOutro: ui.vendas_pag_label_outro,
          vazioTitulo: ui.vendas_vazio_titulo,
          vazioSub: ui.vendas_vazio_sub,
          detalheTitulo: m.gerente.venda_detalhe_titulo,
          detalheErroTitulo: ui.vendas_detalhe_erro_titulo,
          detalheErroSub: ui.vendas_detalhe_erro_sub,
          detalheData: ui.vendas_detalhe_data,
          detalheTipo: ui.vendas_detalhe_tipo,
          detalheOperador: ui.vendas_detalhe_operador,
          detalheNfe: ui.vendas_detalhe_nfe,
          detalheCliente: ui.vendas_detalhe_cliente,
          detalheCancelamento: ui.vendas_detalhe_cancelamento,
          detalheCanceladoEm: ui.vendas_detalhe_cancelado_em,
          detalheCanceladoPor: ui.vendas_detalhe_cancelado_por,
          detalheMotivo: ui.vendas_detalhe_motivo,
          detalheEstornado: ui.vendas_detalhe_estornado,
          detalheSaldoAberto: ui.vendas_detalhe_saldo_aberto,
          detalheVerFinanceiro: ui.vendas_detalhe_ver_financeiro,
          detalheBruto: m.gerente.venda_bruto,
          detalheDesconto: m.gerente.venda_desconto,
          detalheLiquido: ui.vendas_detalhe_liquido,
          detalheItens: m.gerente.sec_itens_venda,
          detalheNenhumItem: ui.vendas_detalhe_nenhum_item,
          cancelarAcao: ui.vendas_acao_cancelar,
          devolverAcao: ui.vendas_acao_devolver,
        }} />

        {page > 1 || hasMore ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-caption text-jl-fg-3">{ui.vendas_pag_pagina.replace('{{atual}}', String(page))}</span>
            <div className="flex items-center gap-1">
              <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
                {ui.paginacao_anterior}
              </PageLink>
              <PageLink href={pageHref(page + 1)} disabled={!hasMore}>
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
      <span className="cursor-not-allowed rounded-lg border border-[var(--color-border-secondary)] px-2.5 py-1 text-caption text-jl-fg-3 opacity-50">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-[var(--color-border-secondary)] px-2.5 py-1 text-caption text-jl-fg-2 transition-colors hover:bg-jl-surface-elev hover:text-jl-fg-1"
    >
      {children}
    </Link>
  )
}
