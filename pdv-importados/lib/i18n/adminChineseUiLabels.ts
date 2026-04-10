/**
 * Textos do painel /admin com variantes PT + 中文.
 * Desligue o chinês com NEXT_PUBLIC_ADMIN_CHINESE_UI=false (mantém layout funcional em PT).
 */

export type BilingualLine = { pt: string; cn: string }

export function adminChineseUiEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ADMIN_CHINESE_UI?.trim().toLowerCase()
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false
  return true
}

/** Título principal + subtítulo opcional (chinês desligado → só PT). */
export function adminHeading(line: BilingualLine): { title: string; subtitle?: string } {
  if (!adminChineseUiEnabled()) return { title: line.pt }
  return { title: line.cn, subtitle: line.pt }
}

/** Uma linha para exibir: "CN · PT" ou só PT. */
export function adminLineBoth(line: BilingualLine): string {
  if (!adminChineseUiEnabled()) return line.pt
  return `${line.cn} · ${line.pt}`
}

/** Duas linhas empilhadas (nav): primária CN, secundária PT. */
export function adminNavLabels(line: BilingualLine): { primary: string; secondary: string } {
  if (!adminChineseUiEnabled()) return { primary: line.pt, secondary: '' }
  return { primary: line.cn, secondary: line.pt }
}

export const adminUi = {
  header: {
    brand: { cn: '进口系统', pt: 'PDV Importados' } satisfies BilingualLine,
    tagline: {
      cn: '管理层 · 销售 · 库存 · 财务',
      pt: 'Painel administrativo',
    } satisfies BilingualLine,
  },
  nav: {
    dashboard: { cn: '主控台', pt: 'Dashboard' } satisfies BilingualLine,
    gerente: { cn: '经理面板', pt: 'Gerente' } satisfies BilingualLine,
    vendas: { cn: '销售', pt: 'Vendas' } satisfies BilingualLine,
    estoque: { cn: '库存', pt: 'Estoque' } satisfies BilingualLine,
    relatorios: { cn: '报告', pt: 'Relatórios' } satisfies BilingualLine,
    caixas: { cn: '钱箱', pt: 'Caixas' } satisfies BilingualLine,
    financeiro: { cn: '财务', pt: 'Financeiro' } satisfies BilingualLine,
  },
  /** Dica curta para tooltip (`title`) dos links da nav — sempre em PT após o rótulo. */
  navHints: {
    dashboard: 'Métricas, gráfico de vendas e últimos pedidos do período.',
    gerente: 'Painel do gerente e atalhos operacionais.',
    vendas: 'Listagem e gestão de vendas.',
    estoque: 'Produtos, saldos e alertas de estoque.',
    relatorios: 'Relatórios e análises operacionais.',
    caixas: 'Caixas e operações de ponto de venda.',
    financeiro: 'Movimentações e visão financeira.',
  } as const,
  dashboard: {
    pageTitle: { cn: '生意看板', pt: 'Dashboard comercial' } satisfies BilingualLine,
    pageSubtitle: { cn: '实时数据', pt: 'Dados do período selecionado' } satisfies BilingualLine,
    newUsers: { cn: '新客户', pt: 'Novos usuários no período' } satisfies BilingualLine,
    periodToday: { cn: '今天', pt: 'Hoje' } satisfies BilingualLine,
    period7d: { cn: '7天', pt: '7 dias' } satisfies BilingualLine,
    period30d: { cn: '30天', pt: '30 dias' } satisfies BilingualLine,
    statusAll: { cn: '全部', pt: 'Todos' } satisfies BilingualLine,
    statusDone: { cn: '完成', pt: 'Concluída' } satisfies BilingualLine,
    statusCancelled: { cn: '取消', pt: 'Cancelada' } satisfies BilingualLine,
    chartTitle: { cn: '销售趋势', pt: 'Tendência de vendas' } satisfies BilingualLine,
    tableTitle: { cn: '最近订单', pt: 'Últimos pedidos' } satisfies BilingualLine,
    tableEmpty: {
      cn: '此筛选条件下没有订单。',
      pt: 'Nenhum pedido encontrado para este filtro.',
    } satisfies BilingualLine,
    footer: {
      cn: '生意兴隆 · 财源广进',
      pt: 'Prosperidade nos negócios',
    } satisfies BilingualLine,
    metricTotalSales: { cn: '总销售额', pt: 'Vendas totais no período' } satisfies BilingualLine,
    metricOrders: { cn: '订单量', pt: 'Pedidos registrados' } satisfies BilingualLine,
    metricTicket: { cn: '客单价', pt: 'Ticket médio' } satisfies BilingualLine,
    metricStock: { cn: '库存预警', pt: 'Alertas de estoque baixo' } satisfies BilingualLine,
    trendStockOk: { cn: '正常', pt: 'OK' } satisfies BilingualLine,
    trendStockWarn: { cn: '注意', pt: 'Atenção' } satisfies BilingualLine,
    tableColId: { cn: '编号', pt: 'ID' } satisfies BilingualLine,
    tableColOperador: { cn: '操作员', pt: 'Operador' } satisfies BilingualLine,
    tableColData: { cn: '日期', pt: 'Data' } satisfies BilingualLine,
    tableColValor: { cn: '金额', pt: 'Valor' } satisfies BilingualLine,
    tableColPagamento: { cn: '支付', pt: 'Pagamento' } satisfies BilingualLine,
    tableColStatus: { cn: '状态', pt: 'Status' } satisfies BilingualLine,
  },
  common: {
    trendError: { cn: '错误', pt: 'Erro' } satisfies BilingualLine,
    unavailable: { cn: '不可用', pt: 'Indisponível' } satisfies BilingualLine,
    emDash: '—',
  },
  errors: {
    partialTitle: {
      cn: '部分数据加载失败',
      pt: 'Falha ao carregar alguns dados',
    } satisfies BilingualLine,
    criticalSalesTitle: {
      cn: '无法加载本期销售数据',
      pt: 'Não foi possível carregar as vendas do período',
    } satisfies BilingualLine,
    criticalSalesBody: {
      cn: '下方数字可能为零或不完整，请勿用于决策。请检查网络、Supabase 与权限 (RLS)。',
      pt: 'Os números abaixo podem aparecer como zero ou incompletos — não use para decisões. Verifique rede, Supabase e permissões (RLS).',
    } satisfies BilingualLine,
    chartUnavailable: {
      cn: '图表暂不可用（销售数据加载失败）。',
      pt: 'Gráfico indisponível: falha ao carregar vendas do período.',
    } satisfies BilingualLine,
    tableLoadFailed: {
      cn: '无法加载订单列表。',
      pt: 'Não foi possível carregar a lista de pedidos.',
    } satisfies BilingualLine,
  },
  statusBadge: {
    concluida: { cn: '已完成', pt: 'Concluída' } satisfies BilingualLine,
    cancelada: { cn: '已取消', pt: 'Cancelada' } satisfies BilingualLine,
  },
} as const
