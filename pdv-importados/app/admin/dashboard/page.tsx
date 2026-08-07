import React from 'react'
import { ActivityFeed, type ActivityItem } from '@/components/ui/ActivityFeed'
import {
  ChartCard,
  MetricCard,
  PageHeader,
  SectionCard,
} from '@/components/ui/admin-v2'
import type { MetricCardIconKey } from '@/components/ui/admin-v2/MetricCard'
import type { SparkTone } from '@/components/ui/admin-v2/sparkline'
import { ErrorState } from '@/components/ui/feedback'
import { createClient } from '@/lib/supabase/server'
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
  periodoVendasEquivalente,
  type DashboardPeriod,
} from './dashboardUtils'
import { mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import { formatDateTimeLocaleDefault, formatDayMonthInLocale } from '@/lib/format/datetime'
import { formatBRL, formatNumberLocale } from '@/lib/format/money'
import Link from 'next/link'
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
  delta?: { value: string; up: boolean }
  icon: MetricCardIconKey
  sparkData?: number[]
  tone?: SparkTone
  deltaPositiveIsGood?: boolean
  hint?: string
  href?: string
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
  const { start, end, previousStart, previousEnd } = getPeriodRange(period, now)

  // Observabilidade visual: algum caixa aberto agora? Best-effort — falha mantém "fechado".
  let algumCaixaAberto = false
  try {
    const { count } = await supabase
      .from('caixas')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ABERTO')
    algumCaixaAberto = (count ?? 0) > 0
  } catch {
    algumCaixaAberto = false
  }

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

  const recentOrdersQuery = supabase
    .from('vendas')
    .select('id,data,total_liquido,status,forma_pagamento,operador_id')
    .order('data', { ascending: false })
    .limit(15)

  const estoqueBaixoQuery = supabase
    .from('v_estoque_baixo')
    .select('id', { count: 'exact', head: true })

  const flagsVisuaisQuery = supabase.rpc('pdv_config_flags_visuais')

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

  const [
    vendasRangeRes,
    vendasPrevRes,
    recentOrdersRes,
    estoqueBaixoRes,
    novosUsuariosAtualRes,
    novosUsuariosPrevRes,
    flagsVisuaisRes,
  ] = await Promise.all([
    statusDb ? vendasRangeQuery.eq('status', statusDb) : vendasRangeQuery,
    statusDb ? vendasPrevQuery.eq('status', statusDb) : vendasPrevQuery,
    statusDb ? recentOrdersQuery.eq('status', statusDb) : recentOrdersQuery,
    estoqueBaixoQuery,
    novosUsuariosAtualQuery,
    novosUsuariosPrevQuery,
    flagsVisuaisQuery,
  ])

  const flagsVisuaisRow = Array.isArray(flagsVisuaisRes.data)
    ? flagsVisuaisRes.data[0]
    : flagsVisuaisRes.data
  const showStockAlerts = !flagsVisuaisRes.error && !!flagsVisuaisRow?.show_stock_alerts

  let estoqueBaixoLista: Array<{ nome: string; quantidade_atual: number; estoque_minimo: number }> = []
  if (showStockAlerts) {
    const { data: listaRows } = await supabase
      .from('v_estoque_baixo')
      .select('nome, quantidade_atual, estoque_minimo')
      .order('deficit', { ascending: false })
      .limit(5)
    estoqueBaixoLista = (listaRows ?? []) as typeof estoqueBaixoLista
  }

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
  if (!recentOrdersRes.error) {
    recentOrdersRaw = (recentOrdersRes.data ?? []) as typeof recentOrdersRaw
  }
  if (!estoqueBaixoRes.error) estoqueBaixoCount = estoqueBaixoRes.count ?? 0
  if (!novosUsuariosAtualRes.error) novosUsuariosAtual = novosUsuariosAtualRes.count ?? 0
  if (!novosUsuariosPrevRes.error) novosUsuariosPrev = novosUsuariosPrevRes.count ?? 0

  const periodSalesFailed = !!vendasRangeRes.error
  const tableLoadFailed = !!recentOrdersRes.error

  const operatorIds = Array.from(
    new Set(
      recentOrdersRaw
        .map((r) => r.operador_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  )
  if (operatorIds.length > 0) {
    const usersRes = await supabase
      .from('usuarios')
      .select('id,nome')
      .in('id', operatorIds)
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

  const totalTrend = formatTrendPercent(totalAtual, totalPrev)
  const pedidosTrend = formatTrendPercent(pedidosAtual, pedidosPrev)
  const ticketTrend = formatTrendPercent(ticketAtual, ticketPrev)
  const novosTrend = formatTrendPercent(novosUsuariosAtual, novosUsuariosPrev)

  const unavail = adminUi.common.unavailable[lk]

  let stockTrendLabel: string
  if (estoqueBaixoRes.error) {
    stockTrendLabel = unavail
  } else {
    stockTrendLabel = estoqueBaixoCount > 0 ? L.trendStockWarn[lk] : L.trendStockOk[lk]
  }

  const stockValue = estoqueBaixoRes.error ? dash.emDash : formatNumberLocale(estoqueBaixoCount, locale)

  // Drill-down só quando o destino consegue reproduzir exatamente o número:
  // KPI que falhou não vira link (levaria a uma lista que não explica um "—"), e
  // período sem equivalente na tela de vendas também não.
  const periodoVendas = periodoVendasEquivalente(period)
  const hrefVendas =
    periodSalesFailed || !periodoVendas
      ? undefined
      : `${ROUTES.admin.vendas}?periodo=${periodoVendas}`
  // Estoque baixo é instantâneo atual, não recorte de período — o link vale
  // independentemente do filtro do dashboard.
  const hrefEstoqueBaixo = estoqueBaixoRes.error
    ? undefined
    : `${ROUTES.admin.estoque}?visao=critico`

  const metrics: Metric[] = [
    {
      label: L.metricTotalSales[lk],
      value: periodSalesFailed ? dash.emDash : formatBRL(totalAtual, locale),
      delta: periodSalesFailed ? undefined : { value: totalTrend.label, up: totalTrend.up },
      icon: 'dollar-sign',
      sparkData: periodSalesFailed ? undefined : salesSpark,
      tone: 'gold',
      href: hrefVendas,
    },
    {
      label: L.metricOrders[lk],
      value: periodSalesFailed ? dash.emDash : formatNumberLocale(pedidosAtual, locale),
      delta: periodSalesFailed ? undefined : { value: pedidosTrend.label, up: pedidosTrend.up },
      icon: 'package',
      sparkData: periodSalesFailed ? undefined : ordersSpark,
      tone: 'success',
      href: hrefVendas,
    },
    {
      label: L.metricTicket[lk],
      value: periodSalesFailed ? dash.emDash : formatBRL(ticketAtual, locale),
      delta: periodSalesFailed ? undefined : { value: ticketTrend.label, up: ticketTrend.up },
      icon: 'shopping-bag',
      sparkData: periodSalesFailed ? undefined : ticketSpark,
      tone: 'gold',
      href: hrefVendas,
    },
    {
      label: L.metricStock[lk],
      value: stockValue,
      delta: estoqueBaixoRes.error ? undefined : { value: stockTrendLabel, up: estoqueBaixoCount === 0 },
      icon: 'alert-circle',
      tone: estoqueBaixoCount > 0 ? 'warning' : 'success',
      deltaPositiveIsGood: true,
      href: hrefEstoqueBaixo,
    },
  ]

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
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
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
        ) : (
          <ChartCard title={L.chartTitle[lk]} className="admin-v2-chart-area">
            <SalesTrendChartLazy data={chartData} variant="default" />
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
          ) : (
            <DashboardChart
              titleLabel={L.hourlyChartTitle[lk]}
              subtitleLabel={L.hourlyChartSubtitle[lk]}
              peakLabel={L.hourlyChartPeak[lk]}
              labels={hourlyLabels}
              data={hourlySeries.map((item) => item.total)}
              peakHour={peakHour}
              peakValue={formatBRL(peakValueRaw, locale)}
            />
          )}
        </SectionCard>

        <SectionCard title={L.paymentsTitle[lk]} className="admin-v2-chart-area">
          <PaymentDonutChartLazy
            data={paymentDonutData}
            total={totalAtual}
            noDataLabel={L.paymentNoData[lk]}
            distributionLabel={L.paymentDistribution[lk]}
          />
        </SectionCard>
      </div>

      <CaixaShortcut
        title={L.caixaShortcutTitle[lk]}
        status={algumCaixaAberto ? L.caixaShortcutStatusAberto[lk] : L.caixaShortcutStatusFechado[lk]}
        openBtn={L.caixaShortcutBtn[lk]}
      />

      <div className="admin-v2-grid-2">
        <SectionCard
          title={L.lowStockTitle[lk]}
          subtitle={L.lowStockSubtitle[lk]}
          action={
            hrefEstoqueBaixo ? (
              <Link
                href={hrefEstoqueBaixo}
                className="text-caption font-medium text-brand underline-offset-2 hover:underline"
              >
                {m.gerente.dashboard_inicio.estoque_critico_ver_todos}
              </Link>
            ) : undefined
          }
        >
          <div className="flex items-end gap-2">
            <span className="text-h1 font-bold tabular-nums text-[var(--color-chart-warm)]">
              {formatNumberLocale(estoqueBaixoCount, locale)}
            </span>
          </div>
          {showStockAlerts && estoqueBaixoLista.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-3">
              {estoqueBaixoLista.map((item) => (
                <li key={item.nome} className="flex items-center justify-between text-caption">
                  <span className="truncate text-fg-muted">{item.nome}</span>
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
