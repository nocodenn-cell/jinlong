/**
 * DEPRECATED (compat): helper legado do /admin.
 * A fonte principal de texto agora é `getMessages(...).admin`.
 * Este módulo permanece apenas para transição gradual de componentes antigos.
 * `NEXT_PUBLIC_ADMIN_CHINESE_UI` controla tema visual/rollout, não dicionário principal.
 */
import { getMessagesWithFallback } from '@/i18n/getMessages'

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

const legacyAdminUi = {
  header: {
    brand: { cn: '金龍', pt: 'Jīn Lóng' } satisfies BilingualLine,
    tagline: {
      cn: '管理层 · 销售 · 库存 · 财务',
      pt: 'Painel administrativo',
    } satisfies BilingualLine,
  },
  nav: {
    dashboard: { cn: '主控台', pt: 'Dashboard' } satisfies BilingualLine,
    gerente: { cn: '经理面板', pt: 'Gerente' } satisfies BilingualLine,
    produtos: { cn: '商品', pt: 'Produtos' } satisfies BilingualLine,
    vendas: { cn: '销售', pt: 'Vendas' } satisfies BilingualLine,
    estoque: { cn: '库存', pt: 'Estoque' } satisfies BilingualLine,
    recebimento: { cn: '收货', pt: 'Recebimento' } satisfies BilingualLine,
    transferencias: { cn: '调拨', pt: 'Transferências' } satisfies BilingualLine,
    relatorios: { cn: '报告', pt: 'Relatórios' } satisfies BilingualLine,
    caixas: { cn: '钱箱', pt: 'Caixas' } satisfies BilingualLine,
    financeiro: { cn: '财务', pt: 'Financeiro' } satisfies BilingualLine,
  },
  /** Dica curta para tooltip (`title`) dos links da nav — sempre em PT após o rótulo. */
  navHints: {
    dashboard: 'Métricas, gráfico de vendas e últimos pedidos do período.',
    gerente: 'Painel do gerente e atalhos operacionais.',
    produtos: 'Cadastro e preços de produtos.',
    vendas: 'Listagem e gestão de vendas.',
    estoque: 'Saldos por loja e alertas de estoque.',
    recebimento: 'Entrada de mercadorias e conferência.',
    transferencias: 'Movimentação entre lojas.',
    relatorios: 'Relatórios e análises operacionais.',
    caixas: 'Caixas e operações de ponto de venda.',
    financeiro: 'Movimentações e visão financeira.',
  } as const,
  dashboard: {
    pageTitle: { cn: '生意看板', pt: 'Dashboard comercial' } satisfies BilingualLine,
    pageSubtitle: { cn: '实时数据', pt: 'Dados do período selecionado' } satisfies BilingualLine,
    newUsers: { cn: '新用户', pt: 'Novos usuários no período' } satisfies BilingualLine,
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
    tableEmptyDescription: {
      cn: '调整时间范围，或前往销售页查看完整历史。',
      pt: 'Ajuste o período ou abra Vendas para ver o histórico completo.',
    } satisfies BilingualLine,
    tableEmptyCta: { cn: '查看销售', pt: 'Abrir Vendas' } satisfies BilingualLine,
    openOrdersAria: { cn: '打开销售页', pt: 'Abrir página de vendas' } satisfies BilingualLine,
    footer: {
      cn: '生意兴隆 · 财源广进',
      pt: 'Prosperidade nos negócios',
    } satisfies BilingualLine,
    metricTotalSales: { cn: '总销售额', pt: 'Faturamento (vendas registradas)' } satisfies BilingualLine,
    metricOrders: { cn: '订单量', pt: 'Pedidos registrados' } satisfies BilingualLine,
    metricTicket: { cn: '客单价', pt: 'Ticket médio' } satisfies BilingualLine,
    metricStock: { cn: '库存预警', pt: 'Estoque baixo' } satisfies BilingualLine,
    metricStockHint: { cn: '点击查看库存', pt: 'Clique para abrir Estoque' } satisfies BilingualLine,
    detalheVendasTitulo: { cn: '本期销售', pt: 'Vendas do período' } satisfies BilingualLine,
    detalhePedidosTitulo: { cn: '本期订单', pt: 'Pedidos do período' } satisfies BilingualLine,
    detalhePorPeriodo: { cn: '按时间', pt: 'Por dia ou hora' } satisfies BilingualLine,
    detalhePorPagamento: { cn: '按支付方式', pt: 'Por forma de pagamento' } satisfies BilingualLine,
    detalheVazio: { cn: '此期间没有数据。', pt: 'Sem dados neste período.' } satisfies BilingualLine,
    detalhePedidosParcial: { cn: '显示 {{total}} 笔中最近的 {{n}} 笔。', pt: 'Mostrando os {{n}} mais recentes de {{total}}.' } satisfies BilingualLine,
    detalheVerTodos: { cn: '在销售页查看全部', pt: 'Ver todos em Vendas' } satisfies BilingualLine,
    trendNew: { cn: '新增', pt: 'novo' } satisfies BilingualLine,
    trendStockOk: { cn: '正常', pt: 'OK' } satisfies BilingualLine,
    trendStockWarn: { cn: '注意', pt: 'Atenção' } satisfies BilingualLine,
    sparkTrendAria: { cn: '期间趋势图', pt: 'Sparkline de tendência no período' } satisfies BilingualLine,
    chartEmpty: { cn: '本期暂无销售数据。', pt: 'Sem vendas no período selecionado.' } satisfies BilingualLine,
    hourlyChartEmpty: {
      cn: '本期暂无按小时数据。',
      pt: 'Sem faturamento por hora no período.',
    } satisfies BilingualLine,
    lowStockEmpty: {
      cn: '当前没有低于最低库存的商品。',
      pt: 'Nenhum item abaixo do mínimo recomendado.',
    } satisfies BilingualLine,
    lowStockCta: { cn: '查看库存', pt: 'Ver estoque' } satisfies BilingualLine,
    salesTrendSummary: {
      cn: '销售趋势：{{points}}',
      pt: 'Tendência de vendas: {{points}}',
    } satisfies BilingualLine,
    hourlyChartSummary: {
      cn: '{{title}}. {{peakLabel}}: {{peakValue}}, {{peakHour}}. {{subtitle}}',
      pt: '{{title}}. {{peakLabel}}: {{peakValue}}, {{peakHour}}. {{subtitle}}',
    } satisfies BilingualLine,
    paymentsSummary: {
      cn: '{{label}}: {{parts}}',
      pt: '{{label}}: {{parts}}',
    } satisfies BilingualLine,
    tableColId: { cn: '编号', pt: 'ID' } satisfies BilingualLine,
    tableColOperador: { cn: '操作员', pt: 'Operador' } satisfies BilingualLine,
    tableColData: { cn: '日期', pt: 'Data' } satisfies BilingualLine,
    tableColValor: { cn: '金额', pt: 'Valor' } satisfies BilingualLine,
    tableColPagamento: { cn: '支付', pt: 'Pagamento' } satisfies BilingualLine,
    tableColStatus: { cn: '状态', pt: 'Status' } satisfies BilingualLine,
  },
  common: {
    signOut: { cn: '退出登录', pt: 'Sair' } satisfies BilingualLine,
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

function isAdminUiShape(value: unknown): value is typeof legacyAdminUi {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return !!(v.header && v.nav && v.dashboard && v.common && v.errors && v.statusBadge)
}

/**
 * Camada de compatibilidade (dual-read):
 * 1) tenta namespace `admin` do JSON único (`getMessages().admin`)
 * 2) fallback para o dicionário legado inline.
 */
function readAdminNamespace(messages: unknown): unknown {
  if (!messages || typeof messages !== 'object') return undefined
  return (messages as Record<string, unknown>).admin
}

function readAdminUiFromMessages(): typeof legacyAdminUi | null {
  const fromPt = readAdminNamespace(getMessagesWithFallback('pt'))
  if (isAdminUiShape(fromPt)) return fromPt

  const fromZh = readAdminNamespace(getMessagesWithFallback('zh'))
  if (isAdminUiShape(fromZh)) return fromZh

  
  return null
}

/** @deprecated Use `getMessages(idioma).admin` diretamente nas telas novas. */
export const adminUi = readAdminUiFromMessages() ?? legacyAdminUi
