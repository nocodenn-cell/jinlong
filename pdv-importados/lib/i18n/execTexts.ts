/**
 * Textos dos painéis executivos de Relatórios e da Visão Geral (PT / 中文).
 * Módulo sem 'use client': usado tanto por Server Components (Visão Geral) quanto pelo hook cliente.
 * Os textos PT preservam a redação anterior à internacionalização (sem regressão de testes).
 * Revisão por falante nativo pendente para os termos financeiros (ver docs/ux).
 */

type Par = readonly [pt: string, zh: string]

export const EXEC_TEXTS = {
  // ── títulos de página / ações de cabeçalho
  'view.vendas-caixas': ['Vendas & Caixas', '销售与收银'],
  'view.dre-financeiro': ['DRE & Financeiro', '损益与财务'],
  'view.produtos-estoque': ['Produtos & Estoque', '商品与库存'],
  'view.crm-auditoria': ['CRM & Auditoria', '客户与审计'],
  'hdr.visao_geral': ['Visão Geral', '总览'],
  'hdr.exportar': ['Exportar (via filtros)', '导出（通过筛选）'],

  'hdr.sair': ['Sair', '退出'],
  'hdr.abas_executivas': ['Abas executivas', '分析视图'],
  'hdr.mais_acoes': ['Mais ações', '更多操作'],

  // ── Visão Geral (dashboard)
  'dash.ir_vendas': ['Ir para Vendas & Caixas', '前往销售与收银'],
  'dash.exportar_pdf': ['Exportar PDF (em breve)', '导出 PDF（即将推出）'],
  'dash.alertas': ['Alertas rápidos', '快速提醒'],
  'dash.executivo': ['Executivo', '管理层'],
  'dash.cap_alertas': ['Alertas executivos', '管理层提醒'],
  'dash.col_detalhe': ['Detalhe', '详情'],
  'dash.estoque_baixo': ['Estoque baixo', '库存偏低'],
  'dash.estoque_ok': ['Estoque OK', '库存正常'],
  'dash.caixa_aberto': ['Caixa aberto', '收银已开'],
  'dash.caixas_fechados': ['Caixas fechados', '收银已关'],

  // ── comuns
  'com.abrir': ['Abrir', '打开'],
  'com.cliente': ['Cliente', '客户'],
  'com.operador': ['Operador', '操作员'],
  'com.produto': ['Produto', '商品'],
  'com.valor': ['Valor', '金额'],
  'com.data': ['Data', '日期'],
  'com.status': ['Status', '状态'],
  'com.fechar': ['Fechar', '关闭'],
  'com.indisponivel': ['Indisponivel', '不可用'],
  'com.nunca': ['Nunca', '从未'],
  'com.sem_operador': ['Sem operador', '无操作员'],

  // ── Vendas & Caixas
  'vc.kpi_fat': ['Faturamento', '营业额'],
  'vc.kpi_vendas': ['Vendas concluidas', '已完成销售'],
  'vc.kpi_cancel': ['Taxa cancelamento', '取消率'],
  'vc.kpi_divcaixa': ['Caixas com divergencia', '有差异的收银班次'],
  'vc.kpi_divcaixa_hint': ['Abrir auditoria operacional de caixas', '打开收银运营审计'],
  'vc.chart_hora': ['Vendas por hora do dia', '每小时销售额'],
  'vc.sem_vendas': ['Sem vendas concluidas no periodo', '本期无已完成销售'],
  'vc.pico': ['Pico', '高峰'],
  'vc.pico_vendas': ['({n} vendas)', '（{n} 笔销售）'],
  'vc.aria_barras': ['Barras por hora', '每小时柱状图'],
  'vc.sec_transacoes': ['Transacoes do periodo', '本期交易'],
  'vc.cap_transacoes': ['Transacoes', '交易'],
  'vc.empty_transacoes': ['Nenhuma venda no periodo', '本期无销售'],
  'vc.col_pagamento': ['Pagamento', '支付方式'],
  'vc.st_cancelada': ['Cancelada', '已取消'],
  'vc.st_concluida': ['Concluida', '已完成'],
  'vc.sec_caixas': ['Auditoria de caixas', '收银审计'],
  'vc.sec_caixas_sub': ['Sistema vs contado (fechamentos do periodo)', '系统金额与实点金额（本期结账）'],
  'vc.fechados_hoje': ['Fechados hoje: {n}', '今日已结账：{n}'],
  'vc.com_div': ['Com divergencia: {n}', '有差异：{n}'],
  'vc.cap_caixas': ['Caixas fechados', '已结账收银班次'],
  'vc.empty_caixas': ['Nenhum fechamento no recorte.', '所选范围内无结账记录。'],
  'vc.abrir_caixas': ['Abrir Caixas', '打开收银管理'],
  'vc.col_sistema': ['Sistema', '系统'],
  'vc.col_contado': ['Contado', '实点'],
  'vc.col_diverg': ['Diverg.', '差异'],
  'vc.ver_historico': ['Ver historico completo', '查看完整历史'],
  'vc.det_pedido': ['Detalhe do pedido', '订单详情'],
  'vc.abrir_ficha': ['Abrir ficha completa', '打开完整详情'],
  'vc.clique_valor': [
    'Clique no valor de uma transacao para ver o resumo lateral.',
    '点击交易金额，可在侧边查看摘要。',
  ],

  // ── Produtos & Estoque
  'pe.kpi_classe_a': ['Classe A', 'A 类'],
  'pe.kpi_sem_giro': ['Sem giro (>30d)', '滞销（>30天）'],
  'pe.kpi_reposicao': ['Reposicao urgente', '紧急补货'],
  'pe.kpi_oc': ['Ordens de compra', '采购订单'],
  'pe.kpi_oc_hint': ['Acompanhar OC em transito no modulo Compras', '在“采购”模块跟踪在途采购单'],
  'pe.sec_abc': ['Curva ABC por contribuicao de receita', '按收入贡献的 ABC 曲线'],
  'pe.cap_abc': ['Curva ABC', 'ABC 曲线'],
  'pe.empty_abc': ['Sem dados de curva ABC no periodo', '本期无 ABC 曲线数据'],
  'pe.col_receita': ['Receita', '收入'],
  'pe.col_part': ['Part. %', '占比 %'],
  'pe.col_acum': ['Acum. %', '累计 %'],
  'pe.col_classe': ['Classe', '等级'],
  'pe.sec_encalhe': ['Encalhe (sem giro)', '滞销（无周转）'],
  'pe.cap_encalhe': ['Encalhe', '滞销'],
  'pe.empty_encalhe': ['Nenhum item sem giro no recorte', '所选范围内无滞销商品'],
  'pe.col_saldo': ['Saldo', '库存'],
  'pe.col_imob': ['Valor imobilizado', '占压资金'],
  'pe.col_ult': ['Ult. venda', '最近销售'],
  'pe.sec_reposicao': ['Reposicao urgente', '紧急补货'],
  'pe.cap_reposicao': ['Reposicao', '补货'],
  'pe.empty_reposicao': ['Nenhum item abaixo do minimo', '没有低于最低库存的商品'],
  'pe.col_deficit': ['Deficit', '缺口'],
  'pe.col_atual_min': ['Atual/min', '当前/最低'],
  'pe.link_oc': ['Criar / acompanhar OC', '创建 / 跟踪采购单'],
  'pe.sec_cobertura': ['Cobertura de estoque (dias)', '库存覆盖天数'],
  'pe.cap_cobertura': ['Cobertura', '覆盖'],
  'pe.empty_cobertura': ['Sem cobertura calculada', '尚未计算覆盖天数'],
  'pe.col_media': ['Média/dia', '日均销量'],
  'pe.col_cobertura': ['Cobertura', '覆盖天数'],
  'pe.dias': ['dias', '天'],
  'pe.dias_cap': ['>{{n}} dias', '>{{n}} 天'],

  // ── DRE & Financeiro
  'dre.cascata_bruta': ['Receita bruta (faturamento)', '总收入（营业额）'],
  'dre.cascata_dev': ['(−) Devolucoes', '（−）退货'],
  'dre.cascata_liq': ['Receita liquida', '净收入'],
  'dre.cascata_cmv': ['(−) CMV / custo conhecido', '（−）销货成本 / 已知成本'],
  'dre.cascata_mb': ['Margem bruta estimada', '预估毛利'],
  'dre.cascata_desp': ['(−) Despesas + taxas', '（−）费用 + 手续费'],
  'dre.cascata_ll': ['Resultado operacional estimado', '预估经营结果'],
  'dre.kpi_bruta': ['Receita bruta', '总收入'],
  'dre.kpi_liq': ['Receita liquida', '净收入'],
  'dre.kpi_mb': ['Margem bruta est.', '预估毛利'],
  'dre.kpi_vencidos': ['Titulos vencidos (AR)', '逾期应收款'],
  'dre.mb_faixa': ['{piso} a {teto}', '{piso} 至 {teto}'],
  'dre.hint_faixa': [
    'Custo incompleto em {n} venda(s) ({valor}){parcial}: margem entre piso e teto{devolucoes}',
    '{n} 笔销售缺少成本（{valor}）{parcial}：毛利介于下限与上限之间{devolucoes}',
  ],
  'dre.hint_parcial': [
    ' — lista parcial (200 vendas mais recentes): pode haver outras vendas sem custo',
    ' —— 列表不完整（仅最近 200 笔销售）：可能还有其他缺少成本的销售',
  ],
  'dre.hint_devolucoes': ['; piso conservador (há devoluções)', '；下限偏保守（存在退货）'],
  'dre.hint_fuso': [
    'Custo incompleto — apenas o teto (fuso do relatório difere do Financeiro)',
    '成本不完整 —— 仅显示上限（报表时区与财务模块不同）',
  ],
  'dre.hint_teto': ['Custo incompleto — margem aproximada (teto){parcial}', '成本不完整 —— 近似毛利（上限）{parcial}'],
  'dre.sec_cascata': ['DRE em cascata (estimativa gerencial)', '损益瀑布（管理估算）'],
  'dre.parcial_fin': [
    'Painel financeiro parcial: {erro}. Cascata usa dados de vendas disponiveis.',
    '财务面板不完整：{erro}。瀑布图使用现有销售数据。',
  ],
  'dre.cap_cascata': ['DRE cascata', '损益瀑布'],
  'dre.col_linha': ['Linha', '项目'],
  'dre.nota_contabil': [
    'Nao e lucro contabil. CMV e despesas vêm do resultado gerencial do Financeiro quando carregado; cadastre custos e despesas para fechar a cascata.',
    '这不是会计利润。销货成本与费用来自财务模块的管理结果（已加载时）；请登记成本与费用以补全瀑布图。',
  ],
  'dre.sec_fluxo': ['Previsao de fluxo (saldo)', '现金流预测（余额）'],
  'dre.cap_fluxo': ['Fluxo', '现金流'],
  'dre.col_dia': ['Dia', '日期'],
  'dre.col_entradas': ['Entradas', '收入'],
  'dre.col_saidas': ['Saidas', '支出'],
  'dre.col_saldo': ['Saldo', '余额'],
  'dre.empty_fluxo': ['Fluxo nao carregado neste recorte', '此范围内未加载现金流'],
  'dre.link_resumo': ['Resumo financeiro', '财务摘要'],
  'dre.link_resultado': ['Resultado', '经营结果'],
  'dre.sec_inadimplencia': ['Inadimplencia / titulos vencidos', '逾期 / 应收账款'],
  'dre.cap_vencidos': ['Vencidos a receber', '逾期应收'],
  'dre.empty_vencidos': ['Nenhum titulo vencido em aberto', '没有未结清的逾期款项'],
  'dre.col_titulo': ['Titulo', '款项'],
  'dre.col_vencimento': ['Vencimento', '到期日'],
  'dre.col_aberto': ['Aberto', '未结清'],
  'dre.link_pagar': ['Ver contas a pagar ({n}+)', '查看应付款（{n}+）'],
  'dre.rodape': ['Operacao de titulos permanece em', '款项操作仍在'],
  'dre.rodape_link': ['Financeiro e fiscal', '财务与税务'],

  // ── CRM & Auditoria
  'crm.kpi_clientes': ['Clientes no RFV', 'RFV 客户数'],
  'crm.kpi_cancel': ['Cancelamentos %', '取消率 %'],
  'crm.kpi_desc': ['Descontos concedidos', '已给折扣'],
  'crm.kpi_comissoes': ['Comissoes', '佣金'],
  'crm.kpi_comissoes_hint': ['Apuracao e liquidacao no modulo Comissoes', '在“佣金”模块核算与结算'],
  'crm.sec_rfv': ['Segmentacao RFV (periodo)', 'RFV 客户分层（本期）'],
  'crm.rfv_nota': [
    'Heuristica local sobre vendas do periodo (Recencia · Frequencia · Valor). Cadastro completo em',
    '基于本期销售的本地启发式分析（最近购买 · 频次 · 金额）。完整资料见',
  ],
  'crm.rfv_link': ['Clientes', '客户'],
  'crm.cap_rfv': ['RFV', 'RFV'],
  'crm.empty_rfv': ['Sem clientes com compra no periodo', '本期无购买客户'],
  'crm.col_segmento': ['Segmento', '分层'],
  'crm.cliente_anonimo': ['Cliente não identificado', '未识别客户'],
  'crm.col_r': ['R (dias)', 'R（天）'],
  'crm.seg.Campeões': ['Campeões', '冠军客户'],
  'crm.seg.Fieis': ['Fieis', '忠诚客户'],
  'crm.seg.Em risco': ['Em risco', '流失风险'],
  'crm.seg.Hibernando': ['Hibernando', '沉睡客户'],
  'crm.seg.Novos': ['Novos', '新客户'],
  'crm.sec_operadores': ['Performance de operadores', '操作员业绩'],
  'crm.cap_operadores': ['Operadores', '操作员'],
  'crm.empty_operadores': ['Sem vendas por operador', '无操作员销售数据'],
  'crm.col_fat': ['Faturamento', '营业额'],
  'crm.col_vendas': ['Vendas', '销售'],
  'crm.col_canc': ['Canc.', '取消'],
  'crm.link_comissoes': ['Ver comissoes apuradas', '查看已核算佣金'],
  'crm.sec_perdas': ['Painel de perdas', '损失面板'],
  'crm.perda_cancel': ['Cancelamentos', '取消'],
  'crm.perda_desc': ['Descontos (amostra margem)', '折扣（毛利样本）'],
  'crm.perda_base': ['Faturamento base', '基准营业额'],
  'crm.link_auditoria': ['Timeline de auditoria operacional', '运营审计时间线'],
} as const satisfies Record<string, Par>

export type ExecTextKey = keyof typeof EXEC_TEXTS
export type ExecT = (key: ExecTextKey, params?: Record<string, string | number>) => string

export function traduzir(
  idioma: 'pt' | 'zh',
  key: ExecTextKey,
  params?: Record<string, string | number>,
): string {
  const par = EXEC_TEXTS[key] as Par
  let s = idioma === 'zh' ? par[1] : par[0]
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v))
  }
  return s
}
