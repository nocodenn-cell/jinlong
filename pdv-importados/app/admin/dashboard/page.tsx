import React from 'react'
import Link from 'next/link'
import { ActivityFeed, type ActivityItem } from '@/components/ui/ActivityFeed'
import {
  ChartCard,
  MetricCard,
  PageHeader,
  PageActions,
  SectionCard,
} from '@/components/ui/admin-v2'
import { Button } from '@/components/ui/button'
import type { MetricCardIconKey } from '@/components/ui/admin-v2/MetricCard'
import type { SparkTone } from '@/components/ui/admin-v2/sparkline'
import { EmptyState, ErrorState } from '@/components/ui/feedback'
import { createClient } from '@/lib/supabase/server'
import { getRelatorioTimezone } from '@/lib/relatorios/getRelatorioTimezone'
import { contarEstoqueBaixo, lerFlagsVisuaisPdv } from '@/lib/admin/sinaisVisuaisAdmin'
import { SalesTrendChartLazy } from './SalesTrendChartLazy'
import { PaymentDonutChartLazy } from './PaymentDonutChartLazy'
import { DashboardChart } from './_components/DashboardChart'
import { CaixaShortcut } from './_components/CaixaShortcut'
import { DashboardFilters } from './_components/DashboardFilters'
import { DashboardOrdersTable } from './_components/DashboardOrdersTable'
import {
  dateKey,
  formatTrendPercent,
  getPeriodRange,
  normalizePeriod,
  normalizeStatus,
  type DashboardPeriod,
} from './dashboardUtils'
import { mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import { formatDateTimeLocaleDefault, formatDayMonthInLocale } from '@/lib/format/datetime'
import { formatBRL, formatNumberLocale } from '@/lib/format/money'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'

type SalesPoint = {
  label: string
  total: number
}

type Metric = {
  label: string
  value: string
  delta?: { value: string; up: boolean; neutral?: boolean }
  icon: MetricCardIconKey
  sparkData?: number[]
  tone?: SparkTone
  deltaPositiveIsGood?: boolean
  hint?: string
  href?: string
  labelWrap?: boolean
  sparkAriaLabel?: string
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    template,
  )
}

type VendaStatus = 'CONCLUIDA' | 'CANCELADA'

type OrderRow = {
  id: string
  operador: string
  valor: string
  status: VendaStatus
  data: string
  formaPagamento: string
}

type HourlyPoint = {
  label: string
  total: number
}

function collectSupabaseErrors(
  entries: ReadonlyArray<{ label: string; error: { message: string } | null }>,
  idioma: string
): string[] {
  const out: string[] = []
  for (const { label, error } of entries) {
    if (error) out.push(`${label}: ${mensagemErroParaUsuario(error.message, idioma)}`)
  }
  return out
}

function ErrorBanner({ messages, title }: { messages: string[]; title: string }) {
  if (messages.length === 0) return null
  return (
    <ErrorState
      title={title}
      description={messages.join(' · ')}
      className="mb-4"
    />
  )
}

type PageProps = {
  searchParams?: Promise<{
    period?: string
    status?: string
  }>
}

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.dashboard,
    resource: `route:${ROUTES.admin.dashboard}`,
  })
  const { idioma } = session
  const m = getMessages(idioma)
  const adminUi = m.admin
  const L = adminUi.dashboard
  const dash = adminUi.common
  const ui = m.admin_ui
  const locale = localeFromIdioma(idioma)
  const lk = idioma === 'zh' ? 'cn' : 'pt'

  const params = searchParams ? await searchParams : undefined
  const period = normalizePeriod(params?.period)
  const status = normalizeStatus(params?.status)
  const statusDb = status === 'ALL' ? null : status
  const supabase = await createClient()
  const now = new Date()

  const recentOrdersQuery = supabase
    .from('vendas')
    .select('id,data,total_liquido,status,forma_pagamento,operador_id')
    .order('data', { ascending: false })
    .limit(15)

  // Etapa 1 — tudo que NÃO depende do fuso do relatório, em paralelo com a leitura
  // do fuso. Antes: fuso → caixas → lote → estoque baixo → operadores, em série.
  // Flags e contagem de estoque baixo vêm do cache por request (o layout já leu).
  const [relatorioTz, algumCaixaAberto, recentOrdersRes, estoqueBaixoRes, flagsVisuaisRes] =
    await Promise.all([
      getRelatorioTimezone(supabase),
      // Observabilidade visual: algum caixa aberto agora? Best-effort — falha mantém "fechado".
      Promise.resolve(
        supabase.from('caixas').select('id', { count: 'exact', head: true }).eq('status', 'ABERTO'),
      ).then(
        ({ count }) => (count ?? 0) > 0,
        () => false,
      ),
      statusDb ? recentOrdersQuery.eq('status', statusDb) : recentOrdersQuery,
      contarEstoqueBaixo(),
      lerFlagsVisuaisPdv(),
    ])
  const { start, end, previousStart, previousEnd } = getPeriodRange(period, relatorioTz, now)

  let vendasRange: Array<{
    id: string
    data: string
    total_liquido: number
    status: VendaStatus
    forma_pagamento: string
    operador_id: string | null
  }> = []
  let vendasPrevRange: Array<{ total_liquido: number }> = []
  let recentOrdersRaw: Array<{
    id: string
    data: string
    total_liquido: number
    status: VendaStatus
    forma_pagamento: string
    operador_id: string | null
  }> = []
  let usuariosRows: Array<{ id: string; nome: string }> = []
  let estoqueBaixoCount = 0
  let novosUsuariosAtual = 0
  let novosUsuariosPrev = 0

  const vendasRangeQuery = supabase
    .from('vendas')
    .select('id,data,total_liquido,status,forma_pagamento,operador_id')
    .gte('data', start.toISOString())
    .lte('data', end.toISOString())
    .order('data', { ascending: true })

  const vendasPrevQuery = supabase
    .from('vendas')
    .select('total_liquido')
    .gte('data', previousStart.toISOString())
    .lt('data', previousEnd.toISOString())

  const novosUsuariosAtualQuery = supabase
    .from('usuarios')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())

  const novosUsuariosPrevQuery = supabase
    .from('usuarios')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', previousStart.toISOString())
    .lt('created_at', previousEnd.toISOString())

  const flagsVisuaisRow = Array.isArray(flagsVisuaisRes.data)
    ? flagsVisuaisRes.data[0]
    : flagsVisuaisRes.data
  const showStockAlerts = !flagsVisuaisRes.error && !!flagsVisuaisRow?.show_stock_alerts

  if (!recentOrdersRes.error) {
    recentOrdersRaw = (recentOrdersRes.data ?? []) as typeof recentOrdersRaw
  }
  const operatorIds = Array.from(
    new Set(
      recentOrdersRaw
        .map((r) => r.operador_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  )

  // Etapa 2 — o que depende do período (fuso) ou dos pedidos recentes, em paralelo.
  const [
    vendasRangeRes,
    vendasPrevRes,
    novosUsuariosAtualRes,
    novosUsuariosPrevRes,
    estoqueBaixoListaRes,
    usersRes,
  ] = await Promise.all([
    statusDb ? vendasRangeQuery.eq('status', statusDb) : vendasRangeQuery,
    statusDb ? vendasPrevQuery.eq('status', statusDb) : vendasPrevQuery,
    novosUsuariosAtualQuery,
    novosUsuariosPrevQuery,
    showStockAlerts
      ? supabase
          .from('v_estoque_baixo')
          .select('nome, quantidade_atual, estoque_minimo')
          .order('deficit', { ascending: false })
          .limit(5)
      : Promise.resolve(null),
    operatorIds.length > 0
      ? supabase.from('usuarios').select('id,nome').in('id', operatorIds)
      : Promise.resolve(null),
  ])

  const estoqueBaixoLista = (estoqueBaixoListaRes?.data ?? []) as Array<{
    nome: string
    quantidade_atual: number
    estoque_minimo: number
  }>

  const dashboardErrors = collectSupabaseErrors([
    {
      label: L.errorSourceSalesPeriod[lk],
      error: vendasRangeRes.error,
    },
    {
      label: L.errorSourceSalesPreviousPeriod[lk],
      error: vendasPrevRes.error,
    },
    {
      label: L.errorSourceRecentOrders[lk],
      error: recentOrdersRes.error,
    },
    {
      label: L.errorSourceLowStock[lk],
      error: estoqueBaixoRes.error,
    },
    {
      label: L.errorSourceNewUsersPeriod[lk],
      error: novosUsuariosAtualRes.error,
    },
    {
      label: L.errorSourceNewUsersPreviousPeriod[lk],
      error: novosUsuariosPrevRes.error,
    },
  ], idioma)

  if (!vendasRangeRes.error) vendasRange = (vendasRangeRes.data ?? []) as typeof vendasRange
  if (!vendasPrevRes.error) vendasPrevRange = (vendasPrevRes.data ?? []) as typeof vendasPrevRange
  if (!estoqueBaixoRes.error) estoqueBaixoCount = estoqueBaixoRes.count ?? 0
  if (!novosUsuariosAtualRes.error) novosUsuariosAtual = novosUsuariosAtualRes.count ?? 0
  if (!novosUsuariosPrevRes.error) novosUsuariosPrev = novosUsuariosPrevRes.count ?? 0

  const periodSalesFailed = !!vendasRangeRes.error
  const tableLoadFailed = !!recentOrdersRes.error

  if (usersRes) {
    if (usersRes.error) {
      dashboardErrors.push(
        `${L.errorSourceOperators[lk]}: ${mensagemErroParaUsuario(usersRes.error.message, idioma)}`,
      )
    } else {
      usuariosRows = usersRes.data ?? []
    }
  }

  const userById = new Map(usuariosRows.map((u) => [u.id, u.nome]))

  const chartBucket = new Map<string, number>()
  const ordersBucket = new Map<string, number>()
  for (const row of vendasRange) {
    const d = new Date(row.data)
    const key = dateKey(d)
    chartBucket.set(key, (chartBucket.get(key) ?? 0) + Number(row.total_liquido ?? 0))
    ordersBucket.set(key, (ordersBucket.get(key) ?? 0) + 1)
  }

  const chartData: SalesPoint[] = []
  const salesSpark: number[] = []
  const ordersSpark: number[] = []
  const ticketSpark: number[] = []
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)
  while (cursor <= end) {
    const key = dateKey(cursor)
    const dayTotal = chartBucket.get(key) ?? 0
    const dayOrders = ordersBucket.get(key) ?? 0
    chartData.push({
      label: formatDayMonthInLocale(cursor, locale),
      total: Math.round(dayTotal * 100) / 100,
    })
    salesSpark.push(dayTotal)
    ordersSpark.push(dayOrders)
    ticketSpark.push(dayOrders > 0 ? dayTotal / dayOrders : 0)
    cursor.setDate(cursor.getDate() + 1)
  }

  const hourlyBucket = new Array<number>(24).fill(0)
  for (const row of vendasRange) {
    const hour = new Date(row.data).getHours()
    hourlyBucket[hour] = (hourlyBucket[hour] ?? 0) + Number(row.total_liquido ?? 0)
  }
  const hourlyLabels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}h`)
  const hourlySeries: HourlyPoint[] = hourlyLabels.map((label, idx) => ({
    label,
    total: Math.round((hourlyBucket[idx] ?? 0) * 100) / 100,
  }))
  let peakHour = '00h'
  let peakValueRaw = 0
  for (const point of hourlySeries) {
    if (point.total > peakValueRaw) {
      peakValueRaw = point.total
      peakHour = point.label
    }
  }

  const paymentMap = new Map<string, number>()
  for (const row of vendasRange) {
    const key = (row.forma_pagamento?.trim() || 'OUTRO').toUpperCase()
    paymentMap.set(key, (paymentMap.get(key) ?? 0) + Number(row.total_liquido ?? 0))
  }
  const paymentDonutData = Array.from(paymentMap.entries())
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  const totalAtual = vendasRange.reduce((acc, row) => acc + Number(row.total_liquido ?? 0), 0)
  const totalPrev = vendasPrevRange.reduce((acc, row) => acc + Number(row.total_liquido ?? 0), 0)
  const pedidosAtual = vendasRange.length
  const pedidosPrev = vendasPrevRange.length
  const ticketAtual = pedidosAtual > 0 ? totalAtual / pedidosAtual : 0
  const ticketPrev = pedidosPrev > 0 ? totalPrev / pedidosPrev : 0

  const trendLabels = { newLabel: L.trendNew[lk], flatLabel: dash.emDash }
  const totalTrend = formatTrendPercent(totalAtual, totalPrev, trendLabels)
  const pedidosTrend = formatTrendPercent(pedidosAtual, pedidosPrev, trendLabels)
  const ticketTrend = formatTrendPercent(ticketAtual, ticketPrev, trendLabels)
  const novosTrend = formatTrendPercent(novosUsuariosAtual, novosUsuariosPrev, trendLabels)

  const unavail = adminUi.common.unavailable[lk]

  let stockTrendLabel: string
  if (estoqueBaixoRes.error) {
    stockTrendLabel = unavail
  } else {
    stockTrendLabel = estoqueBaixoCount > 0 ? L.trendStockWarn[lk] : L.trendStockOk[lk]
  }

  const stockValue = estoqueBaixoRes.error ? dash.emDash : formatNumberLocale(estoqueBaixoCount, locale)
  const sparkAria = L.sparkTrendAria[lk]
  const hasSalesInPeriod = !periodSalesFailed && chartData.some((point) => point.total > 0)
  const hasHourlySales = !periodSalesFailed && peakValueRaw > 0

  const metrics: Metric[] = [
    {
      label: L.metricTotalSales[lk],
      value: periodSalesFailed ? dash.emDash : formatBRL(totalAtual, locale),
      delta: periodSalesFailed
        ? undefined
        : { value: totalTrend.label, up: totalTrend.up, neutral: totalTrend.neutral },
      icon: 'dollar-sign',
      sparkData: periodSalesFailed ? undefined : salesSpark,
      tone: 'gold',
      labelWrap: true,
      sparkAriaLabel: sparkAria,
    },
    {
      label: L.metricOrders[lk],
      value: periodSalesFailed ? dash.emDash : formatNumberLocale(pedidosAtual, locale),
      delta: periodSalesFailed
        ? undefined
        : { value: pedidosTrend.label, up: pedidosTrend.up, neutral: pedidosTrend.neutral },
      icon: 'package',
      sparkData: periodSalesFailed ? undefined : ordersSpark,
      tone: 'success',
      labelWrap: true,
      sparkAriaLabel: sparkAria,
    },
    {
      label: L.metricTicket[lk],
      value: periodSalesFailed ? dash.emDash : formatBRL(ticketAtual, locale),
      delta: periodSalesFailed
        ? undefined
        : { value: ticketTrend.label, up: ticketTrend.up, neutral: ticketTrend.neutral },
      icon: 'shopping-bag',
      sparkData: periodSalesFailed ? undefined : ticketSpark,
      tone: 'gold',
      labelWrap: true,
      sparkAriaLabel: sparkAria,
    },
    {
      label: L.metricStock[lk],
      value: stockValue,
      delta: estoqueBaixoRes.error
        ? undefined
        : { value: stockTrendLabel, up: estoqueBaixoCount === 0, neutral: true },
      icon: 'alert-circle',
      tone: estoqueBaixoCount > 0 ? 'warning' : 'success',
      deltaPositiveIsGood: true,
      href: ROUTES.admin.estoque,
      hint: L.metricStockHint[lk],
      labelWrap: true,
    },
  ]

  const salesTrendSummary = fillTemplate(L.salesTrendSummary[lk], {
    points: chartData.map((point) => `${point.label} ${formatBRL(point.total, locale)}`).join('; '),
  })
  const hourlySummary = fillTemplate(L.hourlyChartSummary[lk], {
    title: L.hourlyChartTitle[lk],
    peakLabel: L.hourlyChartPeak[lk],
    peakValue: formatBRL(peakValueRaw, locale),
    peakHour,
    subtitle: L.hourlyChartSubtitle[lk],
  })
  const paymentsSummary = fillTemplate(L.paymentsSummary[lk], {
    label: L.paymentDistribution[lk],
    parts: paymentDonutData
      .map((entry) => `${entry.name} ${formatBRL(entry.value, locale)}`)
      .join('; '),
  })

  const latestOrders: OrderRow[] = recentOrdersRaw.map((o) => ({
    id: o.id,
    operador: o.operador_id ? (userById.get(o.operador_id) ?? '—') : '—',
    valor: formatBRL(Number(o.total_liquido ?? 0), locale),
    status: o.status,
    data: formatDateTimeLocaleDefault(o.data, locale),
    formaPagamento: o.forma_pagamento,
  }))
  const amountByOrderId = new Map(
    recentOrdersRaw.map((raw) => [raw.id, Number(raw.total_liquido ?? 0)])
  )

  const activityItems: ActivityItem[] = latestOrders.slice(0, 8).map((order) => ({
    id: order.id,
    type: order.status === 'CANCELADA' ? 'cancel' : 'sale',
    description: `${order.formaPagamento || ui.dashboard_pagamento_fallback} • ${order.operador}`,
    amount: amountByOrderId.get(order.id),
    relativeTime: order.data,
  }))

  const periodOptions: Array<{ id: DashboardPeriod; label: string }> = [
    { id: 'TODAY', label: L.periodToday[lk] },
    { id: '7D', label: L.period7d[lk] },
    { id: '30D', label: L.period30d[lk] },
  ]

  return (
    <div className="admin-v2-page admin-v2-stack">
      <PageHeader
        title={L.pageTitle[lk]}
        subtitle={`${L.newUsers[lk]}: ${formatNumberLocale(novosUsuariosAtual, locale)} (${novosTrend.label})`}
        filters={<DashboardFilters options={periodOptions} />}
        actions={
          <PageActions>
            <Button asChild variant="secondary" size="sm">
              <Link href={ROUTES.admin.relatorios} title={ui.dashboard_link_relatorios_hint}>
                {ui.relatorios_titulo}
              </Link>
            </Button>
          </PageActions>
        }
      />

      {periodSalesFailed ? (
        <ErrorState
          className="mb-6"
          title={adminUi.errors.criticalSalesTitle[lk]}
          description={adminUi.errors.criticalSalesBody[lk]}
        />
      ) : null}

      <ErrorBanner
        messages={dashboardErrors}
        title={
          dashboardErrors.length === 1
            ? ui.dashboard_erro_banner_sg
            : ui.dashboard_erro_banner_pl.replace('{{n}}', String(dashboardErrors.length))
        }
      />

      <div className="admin-v2-grid-kpi">
        {metrics.map((metric) => {
          const { href, ...cardProps } = metric
          if (!href) {
            return <MetricCard key={metric.label} {...cardProps} />
          }
          return (
            <Link
              key={metric.label}
              href={href}
              className="block rounded-card focus-visible:outline-none focus-visible:shadow-focus"
              aria-label={`${metric.label}: ${metric.value}. ${metric.hint ?? ''}`.trim()}
            >
              <MetricCard {...cardProps} />
            </Link>
          )
        })}
      </div>

      <div className="admin-v2-grid-3-main">
        {periodSalesFailed ? (
          <ChartCard title={L.chartTitle[lk]}>
            <ErrorState
              dense
              title={adminUi.errors.chartUnavailable[lk]}
              description={adminUi.errors.chartUnavailable[lk]}
              className="h-full"
            />
          </ChartCard>
        ) : hasSalesInPeriod ? (
          <ChartCard title={L.chartTitle[lk]} className="admin-v2-chart-area">
            <SalesTrendChartLazy
              data={chartData}
              variant="default"
              summary={salesTrendSummary}
            />
          </ChartCard>
        ) : (
          <ChartCard title={L.chartTitle[lk]} className="admin-v2-chart-area">
            <EmptyState title={L.chartEmpty[lk]} className="h-full py-8" />
          </ChartCard>
        )}

        <SectionCard title={L.hourlyChartTitle[lk]} className="admin-v2-chart-area">
          {periodSalesFailed ? (
            <ErrorState
              dense
              title={adminUi.errors.chartUnavailable[lk]}
              description={adminUi.errors.chartUnavailable[lk]}
              className="h-full"
            />
          ) : hasHourlySales ? (
            <DashboardChart
              titleLabel={L.hourlyChartTitle[lk]}
              subtitleLabel={L.hourlyChartSubtitle[lk]}
              peakLabel={L.hourlyChartPeak[lk]}
              labels={hourlyLabels}
              data={hourlySeries.map((item) => item.total)}
              peakHour={peakHour}
              peakValue={formatBRL(peakValueRaw, locale)}
              summary={hourlySummary}
            />
          ) : (
            <EmptyState title={L.hourlyChartEmpty[lk]} className="h-full py-8" />
          )}
        </SectionCard>

        <SectionCard title={L.paymentsTitle[lk]} className="admin-v2-chart-area">
          <PaymentDonutChartLazy
            data={paymentDonutData}
            total={totalAtual}
            noDataLabel={L.paymentNoData[lk]}
            distributionLabel={L.paymentDistribution[lk]}
            summary={paymentsSummary}
          />
        </SectionCard>
      </div>

      <CaixaShortcut
        title={L.caixaShortcutTitle[lk]}
        status={algumCaixaAberto ? L.caixaShortcutStatusAberto[lk] : L.caixaShortcutStatusFechado[lk]}
        openBtn={L.caixaShortcutBtn[lk]}
      />

      <div className="admin-v2-grid-2">
        <SectionCard title={L.lowStockTitle[lk]} subtitle={L.lowStockSubtitle[lk]}>
          <div className="flex items-end justify-between gap-3">
            <Link
              href={ROUTES.admin.estoque}
              className="text-h1 font-bold tabular-nums text-[var(--color-chart-warm)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
            >
              {formatNumberLocale(estoqueBaixoCount, locale)}
            </Link>
            <Link
              href={ROUTES.admin.estoque}
              className="shrink-0 text-small font-medium text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
            >
              {L.lowStockCta[lk]}
            </Link>
          </div>
          {estoqueBaixoCount === 0 && !estoqueBaixoRes.error ? (
            <p className="mt-3 text-caption text-fg-subtle">{L.lowStockEmpty[lk]}</p>
          ) : null}
          {showStockAlerts && estoqueBaixoLista.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-3">
              {estoqueBaixoLista.map((item) => (
                <li key={item.nome} className="flex items-center justify-between text-caption">
                  <span className="truncate text-fg-muted" title={item.nome}>
                    {item.nome}
                  </span>
                  <span className="shrink-0 tabular-nums text-[var(--color-warning-fg)]">
                    {item.quantidade_atual} / {item.estoque_minimo}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </SectionCard>

        <SectionCard title={L.recentActivitiesTitle[lk]}>
          <ActivityFeed items={activityItems} variant="embedded" />
        </SectionCard>
      </div>

      <SectionCard title={L.tableTitle[lk]}>
        <DashboardOrdersTable
          orders={latestOrders}
          loadFailed={tableLoadFailed}
          labels={{
            colId: L.tableColId[lk],
            colOperador: L.tableColOperador[lk],
            colData: L.tableColData[lk],
            colValor: L.tableColValor[lk],
            colPagamento: L.tableColPagamento[lk],
            colStatus: L.tableColStatus[lk],
            statusDone: L.statusDone[lk],
            statusCancelled: L.statusCancelled[lk],
            empty: L.tableEmpty[lk],
            emptyDescription: L.tableEmptyDescription[lk],
            openOrdersAria: L.openOrdersAria[lk],
            loadFailed: adminUi.errors.tableLoadFailed[lk],
          }}
        />
      </SectionCard>

      <footer className="text-center text-fg-subtle">
        <p className="text-body">{L.footer[lk]}</p>
      </footer>
    </div>
  )
}
