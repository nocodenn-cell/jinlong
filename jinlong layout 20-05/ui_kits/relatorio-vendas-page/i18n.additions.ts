/**
 * Adicione no arquivo
 *   pdv-importados/i18n/messages.{pt,zh}.ts
 * (raiz: `relatorios_vendas`)
 */

export const ptRelatoriosVendas = {
  titulo: 'Relatório de vendas',
  subtitulo: 'Análise avançada por período, vendedor, categoria e forma de pagamento.',

  // Filtros
  de: 'De',
  ate: 'Até',
  vendedor: 'Vendedor',
  categoria: 'Categoria',
  forma: 'Forma de pagamento',
  todos: 'Todos',
  todas: 'Todas',
  limpar_filtros: 'Limpar filtros',
  exportar_pdf: 'Exportar PDF',

  // KPIs
  kpi_faturamento: 'Faturamento',
  kpi_ticket: 'Ticket médio',
  kpi_concluidas: 'Concluídas',
  kpi_canceladas: 'Canceladas',
  vendas_concluidas: 'vendas concluídas',
  faturamento: 'Faturamento',

  // Chart
  chart_titulo: 'Faturamento por dia',
  chart_sem_dados: 'Sem dados no período selecionado.',
  dia_sg: 'dia',
  dia_pl: 'dias',

  // Tabela
  col_data: 'Data',
  col_id: 'Venda ID',
  col_cliente: 'Cliente',
  col_vendedor: 'Vendedor',
  col_total: 'Total',
  col_forma: 'Forma',
  col_status: 'Status',
  status_concluida: 'Concluída',
  status_cancelada: 'Cancelada',

  vazio_titulo: 'Nenhuma venda no período',
  vazio_sub: 'Ajuste os filtros ou estenda o intervalo de datas.',
}

export const zhRelatoriosVendas: typeof ptRelatoriosVendas = {
  titulo: '销售报表',
  subtitulo: '按时段、销售员、类别和付款方式的高级分析。',

  de: '从',
  ate: '到',
  vendedor: '销售员',
  categoria: '类别',
  forma: '付款方式',
  todos: '全部',
  todas: '全部',
  limpar_filtros: '清除筛选',
  exportar_pdf: '导出 PDF',

  kpi_faturamento: '营业额',
  kpi_ticket: '客单价',
  kpi_concluidas: '已完成',
  kpi_canceladas: '已取消',
  vendas_concluidas: '完成的销售',
  faturamento: '营业额',

  chart_titulo: '每日营业额',
  chart_sem_dados: '所选时段无数据。',
  dia_sg: '天',
  dia_pl: '天',

  col_data: '日期',
  col_id: '销售 ID',
  col_cliente: '客户',
  col_vendedor: '销售员',
  col_total: '总额',
  col_forma: '方式',
  col_status: '状态',
  status_concluida: '已完成',
  status_cancelada: '已取消',

  vazio_titulo: '该时段无销售',
  vazio_sub: '调整筛选或扩大日期范围。',
}
