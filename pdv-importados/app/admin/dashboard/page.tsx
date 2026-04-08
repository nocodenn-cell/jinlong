import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Package,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
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
  title: string
  value: string
  trend: string
  up: boolean
  icon: LucideIcon
  iconColor: string
}

type VendaStatus = 'CONCLUIDA' | 'CANCELADA'

type OrderRow = {
  id: string
  cliente: string
  valor: string
  status: VendaStatus
  data: string
  formaPagamento: string
}

function statusBadge(status: VendaStatus): ReactNode {
  const config: Record<VendaStatus, { label: string; className: string }> = {
    CONCLUIDA: {
      label: '已完成 / Concluída',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    CANCELADA: {
      label: '已取消 / Cancelada',
      className: 'bg-rose-50 text-rose-700 border-rose-200',
    },
  }
  const meta = config[status]
  return <Badge className={meta.className}>{meta.label}</Badge>
}

function MetricCard({ title, value, trend, up, icon, iconColor }: Metric) {
  const Icon = icon
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between">
        <div className="rounded-lg bg-slate-50 p-2">
          <Icon className={iconColor} size={20} />
        </div>
        <span
          className={`flex items-center text-xs font-medium ${
            up ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {trend}
        </span>
      </div>
      <p className="mb-1 text-sm text-slate-500">{title}</p>
      <h3 className="text-2xl font-bold tabular-nums text-slate-800">{value}</h3>
    </div>
  )
}

type PageProps = {
  searchParams?: Promise<{
    period?: string
    status?: string
  }>
}

export default async function AdminDashboardPage({ searchParams }: PageProps) {
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

  if (!vendasRangeRes.error) vendasRange = (vendasRangeRes.data ?? []) as typeof vendasRange
  if (!vendasPrevRes.error) vendasPrevRange = (vendasPrevRes.data ?? []) as typeof vendasPrevRange
  if (!recentOrdersRes.error) {
    recentOrdersRaw = (recentOrdersRes.data ?? []) as typeof recentOrdersRaw
  }
  if (!estoqueBaixoRes.error) estoqueBaixoCount = estoqueBaixoRes.count ?? 0
  if (!novosUsuariosAtualRes.error) novosUsuariosAtual = novosUsuariosAtualRes.count ?? 0
  if (!novosUsuariosPrevRes.error) novosUsuariosPrev = novosUsuariosPrevRes.count ?? 0

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
    if (!usersRes.error) usuariosRows = usersRes.data ?? []
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

  const metrics: Metric[] = [
    {
      title: '总销售额 (Vendas Totais)',
      value: totalAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      trend: totalTrend.label,
      up: totalTrend.up,
      icon: DollarSign,
      iconColor: 'text-blue-500',
    },
    {
      title: '订单量 (Pedidos)',
      value: pedidosAtual.toLocaleString('pt-BR'),
      trend: pedidosTrend.label,
      up: pedidosTrend.up,
      icon: Package,
      iconColor: 'text-purple-500',
    },
    {
      title: '客单价 (Ticket Médio)',
      value: ticketAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      trend: ticketTrend.label,
      up: ticketTrend.up,
      icon: ShoppingBag,
      iconColor: 'text-emerald-500',
    },
    {
      title: '库存告警 (Alertas Estoque)',
      value: estoqueBaixoCount.toLocaleString('pt-BR'),
      trend: estoqueBaixoCount > 0 ? 'Crítico' : '+0.0%',
      up: estoqueBaixoCount === 0,
      icon: AlertCircle,
      iconColor: 'text-red-500',
    },
  ]

  const latestOrders: OrderRow[] = recentOrdersRaw.map((o) => ({
    id: o.id,
    cliente: o.operador_id ? (userById.get(o.operador_id) ?? 'Operador') : 'Operador',
    valor: Number(o.total_liquido ?? 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }),
    status: o.status,
    data: new Date(o.data).toLocaleString('pt-BR'),
    formaPagamento: o.forma_pagamento,
  }))

  const periodOptions: Array<{ id: DashboardPeriod; label: string }> = [
    { id: 'TODAY', label: '今天 / Hoje' },
    { id: '7D', label: '7天 / 7 dias' },
    { id: '30D', label: '30天 / 30 dias' },
  ]

  const statusOptions: Array<{ id: DashboardStatus; label: string }> = [
    { id: 'ALL', label: '全部 / Todos' },
    { id: 'CONCLUIDA', label: '完成 / Concluída' },
    { id: 'CANCELADA', label: '取消 / Cancelada' },
  ]

  const filterHref = (p: DashboardPeriod, s: DashboardStatus) =>
    `/admin/dashboard?period=${p}&status=${s}`

  return (
    <div className="min-h-screen bg-[#f0f2f5] p-4 font-chinese md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          控制台 <span className="text-lg font-normal text-slate-400">/ Dashboard</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          新客户 / Novos usuários no período: {novosUsuariosAtual.toLocaleString('pt-BR')} (
          {novosTrend.label})
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {periodOptions.map((option) => (
          <Link
            key={option.id}
            href={filterHref(option.id, status)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              period === option.id
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {statusOptions.map((option) => (
          <Link
            key={option.id}
            href={filterHref(period, option.id)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              status === option.id
                ? 'border-violet-500 bg-violet-50 text-violet-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.title} {...metric} />
        ))}
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-700">
            销售趋势 <span className="text-sm font-normal text-slate-400">/ Tendência de Vendas</span>
          </h2>
        </div>
        <div className="h-[350px] w-full">
          <SalesTrendChart data={chartData} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-700">
          最近订单 <span className="text-sm font-normal text-slate-400">/ Últimos Pedidos</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500">
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">客户 / Cliente</th>
                <th className="px-3 py-2 font-medium">日期 / Data</th>
                <th className="px-3 py-2 font-medium">金额 / Valor</th>
                <th className="px-3 py-2 font-medium">支付 / Pagamento</th>
                <th className="px-3 py-2 font-medium">状态 / Status</th>
              </tr>
            </thead>
            <tbody>
              {latestOrders.map((order) => (
                <tr key={order.id} className="border-b border-slate-100">
                  <td className="px-3 py-3 font-medium text-slate-700">{order.id}</td>
                  <td className="px-3 py-3 text-slate-600">{order.cliente}</td>
                  <td className="px-3 py-3 text-slate-600">{order.data}</td>
                  <td className="px-3 py-3 tabular-nums text-slate-700">{order.valor}</td>
                  <td className="px-3 py-3 text-slate-600">{order.formaPagamento}</td>
                  <td className="px-3 py-3">{statusBadge(order.status)}</td>
                </tr>
              ))}
              {latestOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    没有订单 / Nenhum pedido encontrado para este filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

