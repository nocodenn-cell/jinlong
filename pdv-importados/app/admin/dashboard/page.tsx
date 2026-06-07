import Link from 'next/link'
import React, { type ReactNode } from 'react'
import { AlertCircle, DollarSign, Package, ShoppingBag, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/StatCard'
import { createClient } from '@/lib/supabase/server'
import { SalesTrendChartLazy } from './SalesTrendChartLazy'
import {
  dateKey,
  formatTrendPercent,
  getPeriodRange,
  normalizePeriod,
  normalizeStatus,
  type DashboardPeriod,
  type DashboardStatus,
} from './dashboardUtils'
import { mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import { formatDateTimeLocaleDefault, formatDayMonthInLocale } from '@/lib/format/datetime'
import { formatBRL, formatNumberLocale } from '@/lib/format/money'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
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
  icon: LucideIcon
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

function ErrorBanner({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null
  return (
    <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <AlertCircle className="shrink-0" size={18} />
        {messages.length} erro{messages.length !== 1 ? 's' : ''} ao carregar
      </div>
      <ul className="list-inside list-disc space-y-0.5">
        {messages.map((msg, i) => (
          <li key={`${i}-${msg.slice(0, 48)}`}>{msg}</li>
        ))}
      </ul>
    </div>
  )
}

function statusBadge(status: VendaStatus, labels: { concluida: string; cancelada: string }): ReactNode {
  const label = status === 'CONCLUIDA' ? labels.concluida : labels.cancelada
  const config: Record<VendaStatus, { className: string }> = {
    CONCLUIDA: {
      className: 'border border-success/30 bg-success/20 text-success',
    },
    CANCELADA: {
      className: 'border border-destructive/30 bg-destructive/20 text-destructive',
    },
  }
  const meta = config[status]
  return <Badge className={meta.className}>{label}</Badge>
}

type PageProps = {
  searchParams?: Promise<{
    period?: string
    status?: string
  }>
}

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: '/admin/dashboard',
    resource: 'route:/admin/dashboard',
  })
  const { idioma } = session
  const m = getMessages(idioma)
  const adminUi = m.admin
  const L = adminUi.dashboard
  const dash = adminUi.common
  const locale = localeFromIdioma(idioma)

  const params = searchParams ? await searchParams : undefined
  const period = normalizePeriod(params?.period)
  const status = normalizeStatus(params?.status)
  const statusDb = status === 'ALL' ? null : status
  const supabase = await createClient()
  const now = new Date()
  const { start, end, previousStart, previousEnd } = getPeriodRange(period, now)

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
  ] = await Promise.all([
    statusDb ? vendasRangeQuery.eq('status', statusDb) : vendasRangeQuery,
    statusDb ? vendasPrevQuery.eq('status', statusDb) : vendasPrevQuery,
    statusDb ? recentOrdersQuery.eq('status', statusDb) : recentOrdersQuery,
    estoqueBaixoQuery,
    novosUsuariosAtualQuery,
    novosUsuariosPrevQuery,
  ])

  const dashboardErrors = collectSupabaseErrors([
    {
      label: L.errorSourceSalesPeriod.pt,
      error: vendasRangeRes.error,
    },
    {
      label: L.errorSourceSalesPreviousPeriod.pt,
      error: vendasPrevRes.error,
    },
    {
      label: L.errorSourceRecentOrders.pt,
      error: recentOrdersRes.error,
    },
    {
      label: L.errorSourceLowStock.pt,
      error: estoqueBaixoRes.error,
    },
    {
      label: L.errorSourceNewUsersPeriod.pt,
      error: novosUsuariosAtualRes.error,
    },
    {
      label: L.errorSourceNewUsersPreviousPeriod.pt,
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
        `${L.errorSourceOperators.pt}: ${mensagemErroParaUsuario(usersRes.error.message, idioma)}`,
      )
    } else {
      usuariosRows = usersRes.data ?? []
    }
  }

  const userById = new Map(usuariosRows.map((u) => [u.id, u.nome]))

  const chartBucket = new Map<string, number>()
  for (const row of vendasRange) {
    const d = new Date(row.data)
    const key = dateKey(d)
    chartBucket.set(key, (chartBucket.get(key) ?? 0) + Number(row.total_liquido ?? 0))
  }

  const chartData: SalesPoint[] = []
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)
  while (cursor <= end) {
    const key = dateKey(cursor)
    chartData.push({
      label: formatDayMonthInLocale(cursor, locale),
      total: Math.round((chartBucket.get(key) ?? 0) * 100) / 100,
    })
    cursor.setDate(cursor.getDate() + 1)
  }

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

  const unavail = adminUi.common.unavailable.pt

  let stockTrendLabel: string
  if (estoqueBaixoRes.error) {
    stockTrendLabel = unavail
  } else {
    stockTrendLabel = estoqueBaixoCount > 0 ? L.trendStockWarn.pt : L.trendStockOk.pt
  }

  const stockValue = estoqueBaixoRes.error ? dash.emDash : formatNumberLocale(estoqueBaixoCount, locale)

  const metrics: Metric[] = [
    {
      label: L.metricTotalSales.pt,
      value: periodSalesFailed ? dash.emDash : formatBRL(totalAtual, locale),
      delta: periodSalesFailed ? undefined : { value: totalTrend.label, up: totalTrend.up },
      icon: DollarSign,
    },
    {
      label: L.metricOrders.pt,
      value: periodSalesFailed ? dash.emDash : formatNumberLocale(pedidosAtual, locale),
      delta: periodSalesFailed ? undefined : { value: pedidosTrend.label, up: pedidosTrend.up },
      icon: Package,
    },
    {
      label: L.metricTicket.pt,
      value: periodSalesFailed ? dash.emDash : formatBRL(ticketAtual, locale),
      delta: periodSalesFailed ? undefined : { value: ticketTrend.label, up: ticketTrend.up },
      icon: ShoppingBag,
    },
    {
      label: L.metricStock.pt,
      value: stockValue,
      delta: estoqueBaixoRes.error ? undefined : { value: stockTrendLabel, up: estoqueBaixoCount === 0 },
      icon: AlertCircle,
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

  const periodOptions: Array<{ id: DashboardPeriod; label: string }> = [
    { id: 'TODAY', label: L.periodToday.pt },
    { id: '7D', label: L.period7d.pt },
    { id: '30D', label: L.period30d.pt },
  ]

  const statusOptions: Array<{ id: DashboardStatus; label: string }> = [
    { id: 'ALL', label: L.statusAll.pt },
    { id: 'CONCLUIDA', label: L.statusDone.pt },
    { id: 'CANCELADA', label: L.statusCancelled.pt },
  ]

  const filterHref = (p: DashboardPeriod, s: DashboardStatus) =>
    `/admin/dashboard?period=${p}&status=${s}`

  const pillPeriod = (active: boolean) =>
    active
      ? 'border border-zinc-700 bg-zinc-800 text-white'
      : 'border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'

  const pillStatus = (active: boolean) =>
    active
      ? 'border border-success bg-success text-success-foreground hover:bg-success/90'
      : 'border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'

  const cardShell = 'mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6'
  const cardShellLast = 'rounded-lg border border-zinc-800 bg-zinc-900 p-6'
  const sectionHeadBorder = 'border-zinc-800'

  const pageTitleBlock = 'mb-6 border-b border-zinc-800 pb-4'

  return (
    <div className="p-4 pb-12 md:p-8">
      <div className={pageTitleBlock}>
        <h1 className="text-2xl font-bold text-zinc-100">{L.pageTitle.pt}</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {L.newUsers.pt}: {formatNumberLocale(novosUsuariosAtual, locale)} ({novosTrend.label})
        </p>
      </div>

      {periodSalesFailed && (
        <div className="mb-6 rounded-lg border-2 border-destructive/35 bg-destructive/10 px-4 py-4 text-sm text-destructive" role="alert">
          <div className="flex gap-2 font-semibold">
            <AlertCircle className="mt-0.5 shrink-0" size={18} />
            {adminUi.errors.criticalSalesTitle.pt}
          </div>
          <p className="mt-2 leading-relaxed">{adminUi.errors.criticalSalesBody.pt}</p>
        </div>
      )}

      <ErrorBanner messages={dashboardErrors} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {periodOptions.map((option) => (
          <Link
            key={option.id}
            href={filterHref(option.id, status)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${pillPeriod(period === option.id)}`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-2">
        {statusOptions.map((option) => (
          <Link
            key={option.id}
            href={filterHref(period, option.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${pillStatus(status === option.id)}`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <StatCard
            key={metric.label}
            {...metric}
          />
        ))}
      </div>

      <div className={cardShell}>
        <div className={`mb-5 flex items-center justify-between border-b pb-3 ${sectionHeadBorder}`}>
          <h2 className="text-lg font-semibold text-zinc-100">{L.chartTitle.pt}</h2>
        </div>
        <div className="h-[350px] w-full">
          {periodSalesFailed ? (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-destructive/40 bg-destructive/10 px-4 text-center text-sm text-destructive">
              {adminUi.errors.chartUnavailable.pt}
            </div>
          ) : (
            <SalesTrendChartLazy data={chartData} variant="default" />
          )}
        </div>
      </div>

      <div className={cardShellLast}>
        <h2 className={`mb-4 border-b pb-3 text-lg font-semibold text-zinc-100 ${sectionHeadBorder}`}>
          {L.tableTitle.pt}
        </h2>
        <div className="overflow-x-auto">
          {tableLoadFailed ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
              {adminUi.errors.tableLoadFailed.pt}
            </div>
          ) : (
            <table className="w-full min-w-[800px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-sm text-zinc-400">
                  <th className="px-3 py-2 font-medium">{L.tableColId.pt}</th>
                  <th className="px-3 py-2 font-medium">{L.tableColOperador.pt}</th>
                  <th className="px-3 py-2 font-medium">{L.tableColData.pt}</th>
                  <th className="px-3 py-2 font-medium">{L.tableColValor.pt}</th>
                  <th className="px-3 py-2 font-medium">{L.tableColPagamento.pt}</th>
                  <th className="px-3 py-2 font-medium">{L.tableColStatus.pt}</th>
                </tr>
              </thead>
              <tbody>
                {latestOrders.map((order) => (
                  <tr key={order.id} className="border-b border-zinc-800 hover:bg-zinc-900/50">
                    <td className="max-w-[120px] truncate px-3 py-3 font-medium text-zinc-100" title={order.id}>
                      {order.id}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-3 text-zinc-300" title={order.operador}>
                      {order.operador}
                    </td>
                    <td className="px-3 py-3 text-zinc-300">{order.data}</td>
                    <td className="px-3 py-3 tabular-nums text-zinc-100">{order.valor}</td>
                    <td className="max-w-[140px] truncate px-3 py-3 text-zinc-300" title={order.formaPagamento}>
                      {order.formaPagamento}
                    </td>
                    <td className="px-3 py-3">
                      {statusBadge(order.status, { concluida: L.statusDone.pt, cancelada: L.statusCancelled.pt })}
                    </td>
                  </tr>
                ))}
                {latestOrders.length === 0 && !tableLoadFailed && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                      <p className="font-medium">{L.tableEmpty.pt}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <footer className="mt-12 text-center text-zinc-500">
        <p className="text-sm">{L.footer.pt}</p>
      </footer>
    </div>
  )
}
