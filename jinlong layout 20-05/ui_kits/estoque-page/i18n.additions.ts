/**
 * Adicione estas chaves ao arquivo
 *   pdv-importados/i18n/messages.{pt,zh}.ts
 * Mescla com o que já existe em `estoque`. Já existem hoje:
 *   titulo, subtitulo, nav_todos, nav_etiquetas, filtro_estoque_baixo,
 *   buscar_label, buscar_placeholder, filtro_todas_categorias,
 *   col_sku, col_produto, col_codigo, col_unidade, col_quantidade_atual,
 *   col_estoque_minimo, col_deficit, col_ajuste, col_atual, col_minimo,
 *   badge_critico, badge_normal, sem_linha, inicializar_estoque,
 *   atualizar, vazio_baixo, vazio_geral_filtrado, dica_baixo,
 *   selecionar_pagina_aria, selecionar_linha_aria, import_nfe.*
 *
 * Abaixo: APENAS as chaves NOVAS exigidas por esta refatoração.
 */

export const ptEstoqueAdditions = {
  toggle_so_baixo: 'Só abaixo do mínimo',
  para_repor: 'para repor',

  col_ultima_movimentacao: 'Última mov.',
  sem_movimentacao: 'Sem dados',

  // Modal — cabeçalho e snapshot
  modal_eyebrow: 'Ajuste de estoque · 库存调整',
  modal_estoque_atual: 'Estoque atual',
  modal_minimo_atual: 'Mínimo configurado',

  // Modal — operação
  modal_operacao: 'Tipo de operação',
  op_entrada: 'Entrada',
  op_saida: 'Saída',
  op_acerto: 'Acerto',
  hint_entrada: 'Adiciona ao estoque atual (compras, devoluções).',
  hint_saida: 'Subtrai do estoque (perdas, transferências, quebras).',
  hint_acerto: 'Define o estoque atual com um novo valor (inventário).',

  // Modal — campos
  modal_quantidade: 'Quantidade',
  modal_novo_estoque: 'Novo estoque atual',
  modal_novo_minimo: 'Novo mínimo',
  modal_hint_unidade: 'em {unidade}',
  modal_motivo: 'Motivo',
  modal_observacao: 'Observação',
  modal_observacao_placeholder: 'Detalhe do ajuste (obrigatório para motivo "Outro")',

  // Modal — preview
  preview_antes: 'Antes',
  preview_depois: 'Depois',

  // Motivos (códigos casam com o RPC ajustar_estoque_manual)
  motivo_entrada_nfe: 'Entrada por NF-e',
  motivo_compra: 'Entrada por compra',
  motivo_devolucao_cliente: 'Devolução de cliente',
  motivo_saida_venda: 'Saída por venda',
  motivo_perda: 'Perda',
  motivo_quebra: 'Quebra / avaria',
  motivo_transferencia: 'Transferência entre lojas',
  motivo_acerto_inventario: 'Acerto de inventário',
  motivo_outro: 'Outro',

  // Confirmação + erros
  confirmar_descartar: 'Descartar este ajuste?',
  modal_confirmar_entrada: 'Confirmar entrada',
  modal_confirmar_saida: 'Confirmar saída',
  modal_confirmar_acerto: 'Salvar acerto',

  err_qty_obrigatoria: 'Informe a quantidade.',
  err_entrada_positiva: 'Entrada deve ser positiva.',
  err_saida_positiva: 'Saída deve ser positiva.',
  err_saida_excede: 'Saída maior que o estoque atual ({atual}).',
  err_negativo: 'Estoque não pode ser negativo.',
  err_minimo_negativo: 'Mínimo não pode ser negativo.',
  err_outro_observacao: 'Para "Outro", a observação é obrigatória (mín. 3 caracteres).',
}

export const zhEstoqueAdditions: typeof ptEstoqueAdditions = {
  toggle_so_baixo: '仅低于最低库存',
  para_repor: '需补货',

  col_ultima_movimentacao: '最近变动',
  sem_movimentacao: '暂无数据',

  modal_eyebrow: '库存调整 · Ajuste de estoque',
  modal_estoque_atual: '当前库存',
  modal_minimo_atual: '最低库存',

  modal_operacao: '操作类型',
  op_entrada: '入库',
  op_saida: '出库',
  op_acerto: '盘点',
  hint_entrada: '增加库存(进货、退货)。',
  hint_saida: '减少库存(损耗、调拨、破损)。',
  hint_acerto: '盘点后将库存设为新值。',

  modal_quantidade: '数量',
  modal_novo_estoque: '新库存',
  modal_novo_minimo: '新最低库存',
  modal_hint_unidade: '单位:{unidade}',
  modal_motivo: '原因',
  modal_observacao: '备注',
  modal_observacao_placeholder: '调整说明(选择"其他"时必填)',

  preview_antes: '调整前',
  preview_depois: '调整后',

  motivo_entrada_nfe: 'NF-e 入库',
  motivo_compra: '采购入库',
  motivo_devolucao_cliente: '客户退货',
  motivo_saida_venda: '销售出库',
  motivo_perda: '损失',
  motivo_quebra: '破损',
  motivo_transferencia: '门店调拨',
  motivo_acerto_inventario: '盘点调整',
  motivo_outro: '其他',

  confirmar_descartar: '放弃此次调整?',
  modal_confirmar_entrada: '确认入库',
  modal_confirmar_saida: '确认出库',
  modal_confirmar_acerto: '保存盘点',

  err_qty_obrigatoria: '请填写数量。',
  err_entrada_positiva: '入库数量必须为正。',
  err_saida_positiva: '出库数量必须为正。',
  err_saida_excede: '出库数量超过当前库存({atual})。',
  err_negativo: '库存不能为负。',
  err_minimo_negativo: '最低库存不能为负。',
  err_outro_observacao: '选择"其他"时必须填写备注(至少 3 字)。',
}
