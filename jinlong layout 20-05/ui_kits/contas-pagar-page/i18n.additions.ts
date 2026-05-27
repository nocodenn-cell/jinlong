/**
 * Adicione no arquivo
 *   pdv-importados/i18n/messages.{pt,zh}.ts
 * (raiz: `contas_pagar`)
 *
 * Depende de: m.comum.cancelar, m.comum.sucesso, m.comum.carregando,
 *             m.comum.fechar, m.gerente.exportar_csv
 */

export const ptContasPagar = {
  titulo: 'Contas a pagar',
  subtitulo: 'Gestão de obrigações com fornecedores · parcelas geradas pela importação de NF-e aparecem aqui automaticamente.',
  conta_sg: 'conta',
  conta_pl: 'contas',
  atrasadas: 'vencidas',
  contas_carregadas: 'contas carregadas',
  lancar: 'Lançar conta',
  acoes_rapidas: 'Ações',

  // KPIs
  kpi_em_aberto: 'Em aberto',
  kpi_atrasadas: 'Atrasadas',
  kpi_filtrado: 'Filtrado',

  // Filtros
  placeholder_busca: 'Buscar por descrição ou nº NF-e…',
  filtro_periodo: 'Filtrar por mês de vencimento',
  filtro_fornecedor: 'Filtrar por fornecedor',
  todos_fornecedores: 'Todos os fornecedores',
  limpar_filtros: 'Limpar filtros',

  // Status (chips + pílulas)
  status_todos: 'Todos',
  status_pendente: 'Pendentes',
  status_parcial: 'Parciais',
  status_atrasado: 'Atrasadas',
  status_pago: 'Pagas',
  status_cancelado: 'Canceladas',

  // Tabela
  col_fornecedor: 'Fornecedor',
  col_descricao: 'Descrição',
  col_vencimento: 'Vencimento',
  col_valor: 'Valor',
  col_valor_pago: 'Valor pago',
  col_em_aberto: 'Em aberto',
  col_status: 'Status',
  col_acoes: 'Ações',
  col_nfe: 'NF-e',
  lancado_em: 'Lançado em',
  pago_label: 'pago',
  aberto_label: 'aberto',
  registrar_pagamento: 'Registrar pagamento',
  btn_pagar: 'Pagar',
  cancelar: 'Cancelar conta',

  vazio_titulo: 'Nenhuma conta encontrada',
  vazio_sub: 'Ajuste os filtros, ou lance uma nova conta a pagar.',

  toast_cancelada: 'Conta cancelada.',

  // Modal
  modal_eyebrow: 'Registrar pagamento',
  modal_total: 'Total',
  modal_pago: 'Pago',
  modal_aberto: 'Em aberto',
  modal_valor: 'Valor pago',
  modal_forma: 'Forma de pagamento',
  modal_data: 'Data do pagamento',
  modal_observacao: 'Observação',
  placeholder_observacao: 'Ex.: comprovante banco · ref 99221',
  valores_sugeridos: 'Valores sugeridos',
  quitar: 'Quitar',
  metade: 'Metade',
  sera_quitada: '✓ Esta conta será quitada.',
  restara: 'Restará',
  em_aberto: 'em aberto',
  pode_parcial: 'Pode ser pagamento total ou parcial.',
  btn_quitar: 'Quitar',
  btn_registrar: 'Registrar',

  // Formas
  forma_dinheiro: 'Dinheiro',
  forma_pix: 'PIX',
  forma_cartao: 'Cartão',
  forma_boleto: 'Boleto',
  forma_transf: 'Transferência',

  // Confirmações / erros
  confirmar_descartar: 'Descartar o pagamento em digitação?',
  err_valor_positivo: 'Informe um valor maior que zero.',
  err_valor_excede: 'Valor maior que o saldo em aberto ({aberto}).',
  err_data_obrigatoria: 'Informe a data do pagamento.',
  err_data_futura: 'A data não pode ser futura.',
}

export const zhContasPagar: typeof ptContasPagar = {
  titulo: '应付账款',
  subtitulo: '供应商对账管理 · NF-e 导入生成的分期款会自动出现在此处。',
  conta_sg: '账',
  conta_pl: '账',
  atrasadas: '已逾期',
  contas_carregadas: '已加载账款',
  lancar: '新增账款',
  acoes_rapidas: '操作',

  kpi_em_aberto: '未结',
  kpi_atrasadas: '逾期',
  kpi_filtrado: '已筛选',

  placeholder_busca: '按描述或 NF-e 号搜索…',
  filtro_periodo: '按到期月筛选',
  filtro_fornecedor: '按供应商筛选',
  todos_fornecedores: '所有供应商',
  limpar_filtros: '清除筛选',

  status_todos: '全部',
  status_pendente: '待付',
  status_parcial: '部分付',
  status_atrasado: '逾期',
  status_pago: '已付',
  status_cancelado: '已取消',

  col_fornecedor: '供应商',
  col_descricao: '描述',
  col_vencimento: '到期日',
  col_valor: '金额',
  col_valor_pago: '已付金额',
  col_em_aberto: '未付金额',
  col_status: '状态',
  col_acoes: '操作',
  col_nfe: 'NF-e',
  lancado_em: '登记于',
  pago_label: '已付',
  aberto_label: '未付',
  registrar_pagamento: '登记付款',
  btn_pagar: '付款',
  cancelar: '取消账款',

  vazio_titulo: '未找到账款',
  vazio_sub: '调整筛选条件,或新增一笔应付账款。',

  toast_cancelada: '账款已取消。',

  modal_eyebrow: '登记付款',
  modal_total: '总额',
  modal_pago: '已付',
  modal_aberto: '未付',
  modal_valor: '付款金额',
  modal_forma: '付款方式',
  modal_data: '付款日期',
  modal_observacao: '备注',
  placeholder_observacao: '例:银行回单 · 凭证 99221',
  valores_sugeridos: '建议金额',
  quitar: '全额结清',
  metade: '一半',
  sera_quitada: '✓ 本笔账款将被结清。',
  restara: '剩余',
  em_aberto: '未付',
  pode_parcial: '可全额或分期付款。',
  btn_quitar: '结清',
  btn_registrar: '登记',

  forma_dinheiro: '现金',
  forma_pix: 'PIX',
  forma_cartao: '刷卡',
  forma_boleto: '支付凭据',
  forma_transf: '转账',

  confirmar_descartar: '放弃当前输入的付款?',
  err_valor_positivo: '金额必须大于零。',
  err_valor_excede: '金额超过未付余额({aberto})。',
  err_data_obrigatoria: '请填写付款日期。',
  err_data_futura: '日期不能是未来日期。',
}
