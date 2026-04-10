import Link from 'next/link'
import type { ReactNode } from 'react'
import { AlertCircle, DollarSign, Package, ShoppingBag, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import {
  adminChineseUiEnabled,
  adminLineBoth,
  adminUi,
} from '@/lib/i18n/adminChineseUiLabels'
import { ChineseStatCard } from '../components/ChineseStatCard'
import { SalesTrendChart } from './SalesTrendChart'
import {
  dateKey,
  formatTrendPercent,
  getPeriodRange,
  normalizePeriod,
  normalizeStatus,
  type DashboardPeriod,
  type DashboardStatus,
} from './dashboardUtils'

type SalesPoint = {
  label: string
  total: number
}

type Metric = {
  titleLine: string
  titleCn?: string
  value: string
  trend: string
  up: boolean
  icon: LucideIcon
  iconAccentClass: string
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
  entries: ReadonlyArray<{ label: string; error: { message: string } | null }>
): string[] {
  const out: string[] = []
  for (const { label, error } of entries) {
    if (error) out.push(`${label}: ${error.message}`)
  }
  return out
}

function DashboardErrorBanner({
  title,
  messages,
  oriental,
}: {
  title: string
  messages: string[]
  oriental: boolean
}) {
  if (messages.length === 0) return null
  const box = oriental
    ? 'error-banner-chinese mb-4 rounded-lg border px-4 py-3 text-sm text-[#2c2c2c] shadow-sm'
    : 'mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm'
  return (
    <div className={box} role="alert">
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <AlertCircle className="shrink-0 text-red-600" size={18} />
        {title}
      </div>
      <ul className={`list-inside list-disc ${oriental ? 'text-[#5c4030]' : 'text-amber-900/90'}`}>
        {messages.map((msg, i) => (
          <li key={`${i}-${msg.slice(0, 48)}`}>{msg}</li>
        ))}
      </ul>
    </div>
  )
}

function CriticalSalesAlert({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="mb-6 rounded-lg border-2 border-red-200 bg-red-50 px-4 py-4 text-sm text-red-950 shadow-sm"
      role="alert"
    >
      <div className="flex gap-2 font-semibold text-red-900">
        <AlertCircle className="mt-0.5 shrink-0" size={18} />
        {title}
      </div>
      <p className="mt-2 leading-relaxed text-red-900/90">{body}</p>
    </div>
  )
}

function statusBadge(status: VendaStatus, oriental: boolean): ReactNode {
  const line =
    status === 'CONCLUIDA' ? adminUi.statusBadge.concluida : adminUi.statusBadge.cancelada
  const label = oriental ? adminLineBoth(line) : line.pt
  const config: Record<VendaStatus, { className: string }> = {
    CONCLUIDA: {
      className:
        'border border-[rgba(45,90,74,0.35)] bg-[#e8f0ec] text-[#2d5a4a]',
    },
    CANCELADA: {
      className:
        'border border-[rgba(196,46,46,0.35)] bg-[#fdecec] text-[#9e2424]',
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
  const oriental = adminChineseUiEnabled()
  const L = adminUi.dashboard
  const dash = adminUi.common

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

  let dashboardErrors = collectSupabaseErrors([
    { label: 'Vendas (período)', error: vendasRangeRes.error },
    { label: 'Vendas (período anterior)', error: vendasPrevRes.error },
    { label: 'Pedidos recentes', error: recentOrdersRes.error },
    { label: 'Alertas de estoque (v_estoque_baixo)', error: estoqueBaixoRes.error },
    { label: 'Novos usuários (período)', error: novosUsuariosAtualRes.error },
    { label: 'Novos usuários (período anterior)', error: novosUsuariosPrevRes.error },
  ])

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
      dashboardErrors.push(`Operadores (nomes): ${usersRes.error.message}`)
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
      label: cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
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

  const trendErr = adminLineBoth(adminUi.common.trendError)
  const unavail = adminLineBoth(adminUi.common.unavailable)

  const stockTrendLabel =
    estoqueBaixoRes.error
      ? unavail
      : oriental
        ? estoqueBaixoCount > 0
          ? adminLineBoth(L.trendStockWarn)
          : adminLineBoth(L.trendStockOk)
        : estoqueBaixoCount > 0
          ? L.trendStockWarn.pt
          : L.trendStockOk.pt

  const stockValue = estoqueBaixoRes.error ? dash.emDash : estoqueBaixoCount.toLocaleString('pt-BR')

  const metrics: Metric[] = periodSalesFailed
    ? [
        {
          titleLine: L.metricTotalSales.pt,
          titleCn: oriental ? L.metricTotalSales.cn : undefined,
          value: dash.emDash,
          trend: trendErr,
          up: false,
          icon: DollarSign,
          iconAccentClass: 'text-[#c42e2e]',
        },
        {
          titleLine: L.metricOrders.pt,
          titleCn: oriental ? L.metricOrders.cn : undefined,
          value: dash.emDash,
          trend: trendErr,
          up: false,
          icon: Package,
          iconAccentClass: 'text-[#2d5a4a]',
        },
        {
          titleLine: L.metricTicket.pt,
          titleCn: oriental ? L.metricTicket.cn : undefined,
          value: dash.emDash,
          trend: trendErr,
          up: false,
          icon: ShoppingBag,
          iconAccentClass: 'text-[#b8960c]',
        },
        {
          titleLine: L.metricStock.pt,
          titleCn: oriental ? L.metricStock.cn : undefined,
          value: stockValue,
          trend: stockTrendLabel,
          up: !estoqueBaixoRes.error && estoqueBaixoCount === 0,
          icon: AlertCircle,
          iconAccentClass: 'text-[#c42e2e]',
        },
      ]
    : [
        {
          titleLine: L.metricTotalSales.pt,
          titleCn: oriental ? L.metricTotalSales.cn : undefined,
          value: totalAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          trend: totalTrend.label,
          up: totalTrend.up,
          icon: DollarSign,
          iconAccentClass: 'text-[#c42e2e]',
        },
        {
          titleLine: L.metricOrders.pt,
          titleCn: oriental ? L.metricOrders.cn : undefined,
          value: pedidosAtual.toLocaleString('pt-BR'),
          trend: pedidosTrend.label,
          up: pedidosTrend.up,
          icon: Package,
          iconAccentClass: 'text-[#2d5a4a]',
        },
        {
          titleLine: L.metricTicket.pt,
          titleCn: oriental ? L.metricTicket.cn : undefined,
          value: ticketAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          trend: ticketTrend.label,
          up: ticketTrend.up,
          icon: ShoppingBag,
          iconAccentClass: 'text-[#b8960c]',
        },
        {
          titleLine: L.metricStock.pt,
          titleCn: oriental ? L.metricStock.cn : undefined,
          value: stockValue,
          trend: stockTrendLabel,
          up: !estoqueBaixoRes.error && estoqueBaixoCount === 0,
          icon: AlertCircle,
          iconAccentClass: 'text-[#c42e2e]',
        },
      ]

  const latestOrders: OrderRow[] = recentOrdersRaw.map((o) => ({
    id: o.id,
    operador: o.operador_id ? (userById.get(o.operador_id) ?? '—') : '—',
    valor: Number(o.total_liquido ?? 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }),
    status: o.status,
    data: new Date(o.data).toLocaleString('pt-BR'),
    formaPagamento: o.forma_pagamento,
  }))

  const periodOptions: Array<{ id: DashboardPeriod; label: string }> = [
    { id: 'TODAY', label: oriental ? adminLineBoth(L.periodToday) : L.periodToday.pt },
    { id: '7D', label: oriental ? adminLineBoth(L.period7d) : L.period7d.pt },
    { id: '30D', label: oriental ? adminLineBoth(L.period30d) : L.period30d.pt },
  ]

  const statusOptions: Array<{ id: DashboardStatus; label: string }> = [
    { id: 'ALL', label: oriental ? adminLineBoth(L.statusAll) : L.statusAll.pt },
    { id: 'CONCLUIDA', label: oriental ? adminLineBoth(L.statusDone) : L.statusDone.pt },
    { id: 'CANCELADA', label: oriental ? adminLineBoth(L.statusCancelled) : L.statusCancelled.pt },
  ]

  const filterHref = (p: DashboardPeriod, s: DashboardStatus) =>
    `/admin/dashboard?period=${p}&status=${s}`

  const pillPeriod = (active: boolean) =>
    oriental
      ? active
        ? 'filter-pill-active'
        : 'filter-pill'
      : active
        ? 'border border-slate-800 bg-slate-900 text-white shadow-sm'
        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'

  const pillStatus = (active: boolean) =>
    oriental
      ? active
        ? 'filter-pill-status-active'
        : 'filter-pill'
      : active
        ? 'border border-emerald-800 bg-emerald-800 text-white shadow-sm'
        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'

  const cardShell = oriental ? 'card-chinese mb-8 p-6' : 'mb-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm'
  const cardShellLast = oriental ? 'card-chinese p-6' : 'rounded-lg border border-slate-200 bg-white p-6 shadow-sm'
  const sectionHeadBorder = oriental ? 'border-[rgba(212,175,55,0.2)]' : 'border-slate-200'

  const pageTitleBlock = oriental ? 'border-chinese mb-6 pb-4' : 'mb-6 border-b border-slate-200 pb-4'

  return (
    <div className="p-4 pb-12 md:p-8">
      <div className={pageTitleBlock}>
        <h1 className="text-2xl font-bold text-slate-900">
          {oriental ? L.pageTitle.cn : L.pageTitle.pt}
          <span className="ml-2 text-lg font-normal text-slate-500">
            {oriental ? `· ${L.pageTitle.pt}` : ''}
          </span>
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {oriental ? (
            <>
              <span className="font-medium text-[#5c4d28]">{L.newUsers.cn}</span>
              <span className="text-slate-500"> · </span>
            </>
          ) : null}
          {L.newUsers.pt}: {novosUsuariosAtual.toLocaleString('pt-BR')} ({novosTrend.label})
        </p>
        {oriental ? (
          <p className="mt-1 text-xs text-slate-500">{adminLineBoth(L.pageSubtitle)}</p>
        ) : null}
      </div>

      {periodSalesFailed ? (
        <CriticalSalesAlert
          title={adminLineBoth(adminUi.errors.criticalSalesTitle)}
          body={adminLineBoth(adminUi.errors.criticalSalesBody)}
        />
      ) : null}

      <DashboardErrorBanner
        oriental={oriental}
        title={adminLineBoth(adminUi.errors.partialTitle)}
        messages={dashboardErrors}
      />

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
          <ChineseStatCard
            key={metric.titleLine}
            variant={oriental ? 'oriental' : 'minimal'}
            {...metric}
          />
        ))}
      </div>

      <div className={cardShell}>
        <div className={`mb-5 flex items-center justify-between border-b pb-3 ${sectionHeadBorder}`}>
          <h2 className="text-lg font-semibold text-slate-900">
            {oriental ? L.chartTitle.cn : L.chartTitle.pt}
            <span className="ml-2 text-sm font-normal text-slate-500">
              {oriental ? `/ ${L.chartTitle.pt}` : ''}
            </span>
          </h2>
        </div>
        <div className="h-[350px] w-full">
          {periodSalesFailed ? (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-red-200 bg-red-50/50 px-4 text-center text-sm text-red-900">
              {adminLineBoth(adminUi.errors.chartUnavailable)}
            </div>
          ) : (
            <SalesTrendChart data={chartData} variant={oriental ? 'oriental' : 'default'} />
          )}
        </div>
      </div>

      <div className={cardShellLast}>
        <h2 className={`mb-4 border-b pb-3 text-lg font-semibold text-slate-900 ${sectionHeadBorder}`}>
          {oriental ? L.tableTitle.cn : L.tableTitle.pt}
          <span className="ml-2 text-sm font-normal text-slate-500">
            {oriental ? `/ ${L.tableTitle.pt}` : ''}
          </span>
        </h2>
        <div className="overflow-x-auto">
          {tableLoadFailed ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-950">
              {adminLineBoth(adminUi.errors.tableLoadFailed)}
            </div>
          ) : (
            <table
              className={
                oriental
                  ? 'admin-table w-full min-w-[800px] border-collapse text-sm'
                  : 'w-full min-w-[800px] border-collapse text-sm'
              }
            >
              <thead>
                <tr
                  className={
                    oriental
                      ? 'border-b text-left text-sm'
                      : 'border-b border-slate-200 text-left text-sm text-slate-600'
                  }
                >
                  <th className="px-3 py-2 font-medium">
                    {oriental ? adminLineBoth(L.tableColId) : L.tableColId.pt}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {oriental ? adminLineBoth(L.tableColOperador) : L.tableColOperador.pt}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {oriental ? adminLineBoth(L.tableColData) : L.tableColData.pt}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {oriental ? adminLineBoth(L.tableColValor) : L.tableColValor.pt}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {oriental ? adminLineBoth(L.tableColPagamento) : L.tableColPagamento.pt}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {oriental ? adminLineBoth(L.tableColStatus) : L.tableColStatus.pt}
                  </th>
                </tr>
              </thead>
              <tbody>
                {latestOrders.map((order) => (
                  <tr
                    key={order.id}
                    className={
                      oriental
                        ? 'border-b border-[rgba(45,90,74,0.12)]'
                        : 'border-b border-slate-100 hover:bg-slate-50'
                    }
                  >
                    <td className="max-w-[120px] truncate px-3 py-3 font-medium text-slate-900" title={order.id}>
                      {order.id}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-3 text-slate-700" title={order.operador}>
                      {order.operador}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{order.data}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-900">{order.valor}</td>
                    <td className="max-w-[140px] truncate px-3 py-3 text-slate-700" title={order.formaPagamento}>
                      {order.formaPagamento}
                    </td>
                    <td className="px-3 py-3">{statusBadge(order.status, oriental)}</td>
                  </tr>
                ))}
                {latestOrders.length === 0 && !tableLoadFailed && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-600">
                      <p className="font-medium">{oriental ? L.tableEmpty.cn : L.tableEmpty.pt}</p>
                      {oriental ? (
                        <p className="mt-1 text-xs text-slate-500">{L.tableEmpty.pt}</p>
                      ) : null}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <footer className="mt-12 text-center text-slate-500">
        {oriental ? (
          <>
            <p className="text-sm tracking-wide">{L.footer.cn}</p>
            <p className="mt-1 text-xs">{L.footer.pt}</p>
          </>
        ) : (
          <p className="text-sm">{L.footer.pt}</p>
        )}
      </footer>
    </div>
  )
}
