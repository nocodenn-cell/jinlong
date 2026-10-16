import React from 'react'
import Link from 'next/link'
import { ActivityFeed, type ActivityItem } from '@/components/ui/ActivityFeed'
import {
  ChartCard,
  SectionCard,
  type KpiStripItem,
} from '@/components/ui/admin-v2'
import type { MetricCardIconKey } from '@/components/ui/admin-v2/MetricCard'
import { ExecutiveVisaoGeralStub } from './_components/ExecutiveVisaoGeralStub'
import { traduzir } from '@/lib/i18n/execTexts'
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
  agruparVendasPorDia,
  agruparVendasPorHora,
  carregarTodasPaginas,
  diasCivisDoPeriodo,
  formatTrendPercent,
  getPeriodRange,
  normalizePeriod,
  normalizeStatus,
  type DashboardPeriod,
} from './dashboardUtils'
import { mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import { formatDateTimeLocaleDefault, formatDayMonthInLocale } from '@/lib/format/datetime'
import { formatBRL, formatNumberLocale } from '@/lib/format/money'
import { calcularMetricasVendas } from '@/lib/vendas/metricasVendas'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@/lib/navigation/routes'
import { getMessages } from '@/i18n/getMessages'
import { labelFormaPagamentoVenda } from '@/lib/format/vendaLabels'
import { contarSituacoesEstoque } from '@/lib/estoque/classificarEstoque'
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
    venda_pos_venda_operacoes: Array<{ valor_estornado: number }> | null
  }> = []
  let vendasPrevRange: Array<{ total_liquido: number; status: VendaStatus }> = []
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

  // População das métricas = vendas CONCLUIDA (contrato canônico, lib/vendas/metricasVendas.ts):
  // cancelada não é faturamento/pedido. O filtro `?status=` só afeta "últimos pedidos".
  // O embed precisa do hint de FK: venda_pos_venda_operacoes tem 2 FKs para vendas (venda_id e venda_substituta_id) e,
  // sem ele, o PostgREST responde PGRST201 (300) e a consulta inteira do período falha.
  // Paginado: o PostgREST corta em silêncio em `max_rows` (1000). `id` desempata a ordenação para as páginas não se sobreporem.
  const vendasRangeQuery = carregarTodasPaginas<(typeof vendasRange)[number]>((from, to) =>
    supabase
      .from('vendas')
      .select('id,data,total_liquido,status,forma_pagamento,operador_id,venda_pos_venda_operacoes!venda_pos_venda_operacoes_venda_id_fkey(valor_estornado)')
      .eq('status', 'CONCLUIDA')
      .gte('data', start.toISOString())
      .lte('data', end.toISOString())
      .order('data', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: (typeof vendasRange)[number][] | null; error: { message: string } | null }>,
  )

  const vendasPrevQuery = carregarTodasPaginas<(typeof vendasPrevRange)[number]>((from, to) =>
    supabase
      .from('vendas')
      .select('total_liquido,status')
      .eq('status', 'CONCLUIDA')
      .gte('data', previousStart.toISOString())
      .lt('data', previousEnd.toISOString())
      .order('data', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: (typeof vendasPrevRange)[number][] | null; error: { message: string } | null }>,
  )

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
    estoqueBaixoListaRes,
    estoqueBaixoSituacoesRes,
    usersRes,
  ] = await Promise.all([
    vendasRangeQuery,
    vendasPrevQuery,
    showStockAlerts
      ? supabase
          .from('v_estoque_baixo')
          .select('nome, quantidade_atual, estoque_minimo')
          .order('deficit', { ascending: false })
          .limit(5)
      : Promise.resolve(null),
    // Mesma view do contador: separa zerados / abaixo do mínimo / no mínimo (só rótulo, a regra do alerta não muda).
    supabase.from('v_estoque_baixo').select('quantidade_atual, estoque_minimo').limit(5000),
    operatorIds.length > 0
      ? supabase.from('usuarios').select('id,nome').in('id', operatorIds)
      : Promise.resolve(null),
  ])

  const estoqueBaixoLista = (estoqueBaixoListaRes?.data ?? []) as Array<{
    nome: string
    quantidade_atual: number
    estoque_minimo: number
  }>

  const situacoesEstoque = contarSituacoesEstoque(
    (estoqueBaixoSituacoesRes?.data ?? []) as Array<{ quantidade_atual: number | null; estoque_minimo: number | null }>,
  )

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
  ], idioma)

  if (!vendasRangeRes.error) vendasRange = (vendasRangeRes.data ?? []) as typeof vendasRange
  if (!vendasPrevRes.error) vendasPrevRange = (vendasPrevRes.data ?? []) as typeof vendasPrevRange
  if (!estoqueBaixoRes.error) estoqueBaixoCount = estoqueBaixoRes.count ?? 0

  const periodSalesFailed = !!vendasRangeRes.error
  // Teto de páginas atingido: os totais podem estar incompletos — nunca apresentar como completos.
  const periodSalesTruncated = vendasRangeRes.truncated || vendasPrevRes.truncated
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

  // Agrupamento por dia/hora no FUSO DA LOJA (antes: UTC e hora do processo Node).
  const { total: chartBucket, pedidos: ordersBucket } = agruparVendasPorDia(vendasRange, relatorioTz)

  const chartData: SalesPoint[] = []
  const salesSpark: number[] = []
  const ordersSpark: number[] = []
  const ticketSpark: number[] = []
  for (const key of diasCivisDoPeriodo(start, end, relatorioTz)) {
    const dayTotal = chartBucket.get(key) ?? 0
    const dayOrders = ordersBucket.get(key) ?? 0
    const [yy, mm, dd] = key.split('-').map(Number)
    chartData.push({
      label: formatDayMonthInLocale(new Date(yy, mm - 1, dd), locale),
      total: Math.round(dayTotal * 100) / 100,
    })
    salesSpark.push(dayTotal)
    ordersSpark.push(dayOrders)
    ticketSpark.push(dayOrders > 0 ? dayTotal / dayOrders : 0)
  }

  const hourlyBucket = agruparVendasPorHora(vendasRange, relatorioTz)
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
    .map(([name, value]) => ({ name: labelFormaPagamentoVenda(name, m), value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  const metricasAtual = calcularMetricasVendas(vendasRange)
  const metricasPrev = calcularMetricasVendas(vendasPrevRange)
  const totalAtual = metricasAtual.faturado
  const totalPrev = metricasPrev.faturado
  const pedidosAtual = metricasAtual.vendasConcluidas
  const pedidosPrev = metricasPrev.vendasConcluidas
  const ticketAtual = metricasAtual.ticketMedio
  const ticketPrev = metricasPrev.ticketMedio
  // Devolução pós-venda não reduz `faturado`; aparece à parte (receita líquida = faturado − devoluções).
  const totalSalesHint =
    metricasAtual.devolucoes > 0
      ? `${L.metricTotalSalesHint[lk]} ${ui.vendas_devolucoes} ${formatBRL(metricasAtual.devolucoes, locale)} · ${ui.vendas_receita_liquida} ${formatBRL(metricasAtual.receitaLiquida, locale)}`
      : L.metricTotalSalesHint[lk]

  const trendLabels = { newLabel: L.trendNew[lk], flatLabel: dash.emDash }
  const totalTrend = formatTrendPercent(totalAtual, totalPrev, trendLabels)
  const pedidosTrend = formatTrendPercent(pedidosAtual, pedidosPrev, trendLabels)
  const ticketTrend = formatTrendPercent(ticketAtual, ticketPrev, trendLabels)

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
      // Faturamento = vendas registradas (accrual), não dinheiro efetivamente
      // recebido — soma total_liquido bruto, inclusive a parte que ficou em
      // contas_receber como pendente. Ver achado FIN-3/FIN-298-07 (auditoria
      // de regras de negócio).
      hint: totalSalesHint,
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
    data: formatDateTimeLocaleDefault(o.data, locale, relatorioTz),
    formaPagamento: labelFormaPagamentoVenda(o.forma_pagamento, m),
  }))
  const amountByOrderId = new Map(
    recentOrdersRaw.map((raw) => [raw.id, Number(raw.total_liquido ?? 0)])
  )

  const activityItems: ActivityItem[] = latestOrders.slice(0, 8).map((order) => ({
    id: order.id,
    type: order.status === 'CANCELADA' ? 'cancel' : 'sale',
    // Texto além da cor do marcador (acessibilidade): venda cancelada diz "Cancelada".
    description: `${order.status === 'CANCELADA' ? `${m.gerente.venda_status_cancelada} • ` : ''}${order.formaPagamento || ui.dashboard_pagamento_fallback} • ${order.operador}`,
    amount: amountByOrderId.get(order.id),
    relativeTime: order.data,
  }))

  const periodOptions: Array<{ id: DashboardPeriod; label: string }> = [
    { id: 'TODAY', label: L.periodToday[lk] },
    { id: '7D', label: L.period7d[lk] },
    { id: '30D', label: L.period30d[lk] },
  ]

  const kpiItems: KpiStripItem[] = metrics.map((metric, index) => ({
    id: `kpi-${index}-${metric.label}`,
    label: metric.label,
    value: metric.value,
    delta: metric.delta,
    deltaPositiveIsGood: metric.deltaPositiveIsGood,
    icon: metric.icon,
    sparkData: metric.sparkData,
    tone: metric.tone,
    hint: metric.hint,
    href: metric.href,
    labelWrap: metric.labelWrap,
    sparkAriaLabel: metric.sparkAriaLabel,
  }))

  const alertRows = [
    {
      id: 'estoque-critico',
      label: traduzir(idioma, estoqueBaixoCount > 0 ? 'dash.estoque_baixo' : 'dash.estoque_ok'),
      detail: formatNumberLocale(estoqueBaixoCount, locale),
      tone: (estoqueBaixoCount > 0 ? 'warning' : 'success') as 'warning' | 'success',
    },
    {
      id: 'caixa-status',
      label: traduzir(idioma, algumCaixaAberto ? 'dash.caixa_aberto' : 'dash.caixas_fechados'),
      detail: algumCaixaAberto ? '1+' : '0',
      tone: (algumCaixaAberto ? 'warning' : 'neutral') as 'warning' | 'neutral',
    },
  ]

  const mainCharts = (
    <>
      {periodSalesFailed ? (
        <ErrorState
          className="mb-2"
          title={adminUi.errors.criticalSalesTitle[lk]}
          description={adminUi.errors.criticalSalesBody[lk]}
        />
      ) : null}
      {periodSalesTruncated ? (
        <div
          role="alert"
          className="mb-2 rounded-[var(--radius-lg)] border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-4 py-3 text-body text-[var(--color-warning-strong)]"
        >
          {ui.dashboard_dados_incompletos}
        </div>
      ) : null}
      <ErrorBanner
        messages={dashboardErrors}
        title={
          dashboardErrors.length === 1
            ? ui.dashboard_erro_banner_sg
            : ui.dashboard_erro_banner_pl.replace('{{n}}', String(dashboardErrors.length))
        }
      />
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
    </>
  )

  const sidePanel = (
    <>
      <CaixaShortcut
        title={L.caixaShortcutTitle[lk]}
        status={algumCaixaAberto ? L.caixaShortcutStatusAberto[lk] : L.caixaShortcutStatusFechado[lk]}
        openBtn={L.caixaShortcutBtn[lk]}
      />
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
        {estoqueBaixoCount > 0 && !estoqueBaixoRes.error && !estoqueBaixoSituacoesRes?.error ? (
          <p className="mt-3 text-caption text-fg-muted">
            {fillTemplate(L.lowStockBreakdown[lk], {
              zerados: formatNumberLocale(situacoesEstoque.zerados, locale),
              abaixo: formatNumberLocale(situacoesEstoque.abaixoMinimo, locale),
              noMinimo: formatNumberLocale(situacoesEstoque.noMinimo, locale),
            })}
          </p>
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
    </>
  )

  const footerBlock = (
    <>
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
            emptyActionLabel: L.tableEmptyCta[lk],
            openOrdersAria: L.openOrdersAria[lk],
            loadFailed: adminUi.errors.tableLoadFailed[lk],
          }}
        />
      </SectionCard>
      <footer className="text-center text-fg-subtle">
        <p className="text-body">{L.footer[lk]}</p>
      </footer>
    </>
  )

  return (
    <ExecutiveVisaoGeralStub
      title={L.pageTitle[lk]}
      subtitle={L.pageSubtitle[lk]}
      filters={(
        <DashboardFilters
          options={periodOptions}
          ariaLabel={ui.filtros_regiao_aria}
          clearAriaLabel={ui.filtros_limpar_aria}
        />
      )}
      kpis={kpiItems}
      alertRows={alertRows}
      idioma={idioma}
      main={mainCharts}
      side={sidePanel}
      footer={footerBlock}
    />
  )
}
