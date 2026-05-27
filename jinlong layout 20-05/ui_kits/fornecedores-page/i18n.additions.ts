/**
 * Adicione estas chaves no arquivo
 *   pdv-importados/i18n/messages.{pt,zh}.ts
 * (raiz: `fornecedores`)
 *
 * Depende de:
 *   m.comum.cancelar, m.comum.sucesso, m.comum.carregando, m.comum.fechar
 */

export const ptFornecedores = {
  titulo: 'Fornecedores',
  contagem: 'fornecedores',
  novo: 'Novo fornecedor',
  editar: 'Editar',
  excluir: 'Excluir',
  placeholder_busca: 'Buscar por nome, CNPJ, contato, e-mail ou categoria…',

  // Tabela
  col_nome: 'Nome',
  col_documento: 'CNPJ / CPF',
  col_telefone: 'Telefone',
  col_email: 'E-mail',
  col_status: 'Status',
  col_acoes: 'Ações',
  status_ativo: 'Ativo',
  status_inativo: 'Inativo',

  // Filtros
  filtro_todos: 'Todos',
  filtro_ativos: 'Ativos',
  filtro_inativos: 'Inativos',

  // Bulk
  bulk_selecionados: 'selecionado(s)',
  bulk_ativar: 'Ativar',
  bulk_inativar: 'Inativar',
  bulk_excluir: 'Excluir selecionados',
  bulk_limpar: 'Limpar seleção',
  toast_bulk_ativados: 'Fornecedores ativados.',
  toast_bulk_inativados: 'Fornecedores inativados.',
  toast_bulk_excluidos: 'Fornecedores excluídos.',
  toast_bulk_excluidos_parcial: '{excluidos} excluídos · {bloqueados} bloqueados (contas em aberto).',

  // Vazio
  vazio_titulo: 'Nenhum fornecedor encontrado',
  vazio_sub: 'Tente outro termo de busca, ou cadastre um novo fornecedor.',

  // a11y
  aria_selecionar_pagina: 'Selecionar todos da página',
  aria_selecionar: 'Selecionar',

  // Confirmação
  confirmar_exclusao: 'Excluir o fornecedor',
  confirmar_descartar: 'Descartar as alterações?',
  confirmar_bulk_exclusao: 'Excluir {n} fornecedor(es)? Esta ação não pode ser desfeita.',
  toast_excluido: 'Fornecedor excluído com sucesso.',

  // Modal — cabeçalho
  modal_novo_titulo: 'Cadastrar fornecedor',
  modal_editar_titulo: 'Editar fornecedor',
  modal_salvar: 'Salvar alterações',
  modal_cadastrar: 'Cadastrar fornecedor',

  // Modal — campos
  tipo_label: 'Tipo de pessoa',
  tipo_pf: 'PF — Pessoa física',
  tipo_pj: 'PJ — Pessoa jurídica',
  field_nome: 'Nome completo',
  field_razao_social: 'Razão social / nome fantasia',
  field_cpf: 'CPF',
  field_cnpj: 'CNPJ',
  field_telefone: 'Telefone',
  field_email: 'E-mail',
  field_contato: 'Pessoa de contato',
  placeholder_contato: 'Ex.: Wang Lei (responsável compras)',
  field_categoria: 'Categoria',
  placeholder_categoria: 'Decoração, Joias, Cozinha, Chás…',

  section_endereco: 'Endereço',
  field_cep: 'CEP',
  field_logradouro: 'Logradouro',
  field_numero: 'Número',
  field_complemento: 'Complemento',
  field_bairro: 'Bairro',
  field_cidade: 'Cidade',
  field_uf: 'UF',

  // Erros
  err_nome_obrigatorio: 'Informe o nome.',
  err_nome_curto: 'Mínimo de 2 caracteres.',
  err_doc_obrigatorio: 'Informe o documento.',
  err_cpf_invalido: 'CPF deve ter 11 dígitos.',
  err_cnpj_invalido: 'CNPJ deve ter 14 dígitos.',
  err_email: 'E-mail inválido.',
  err_cep: 'CEP deve ter 8 dígitos.',
}

export const zhFornecedores: typeof ptFornecedores = {
  titulo: '供应商',
  contagem: '供应商',
  novo: '新建供应商',
  editar: '编辑',
  excluir: '删除',
  placeholder_busca: '按名称、CNPJ、联系人、邮箱或类别搜索…',

  col_nome: '名称',
  col_documento: 'CNPJ / CPF',
  col_telefone: '电话',
  col_email: '邮箱',
  col_status: '状态',
  col_acoes: '操作',
  status_ativo: '启用',
  status_inativo: '停用',

  filtro_todos: '全部',
  filtro_ativos: '启用',
  filtro_inativos: '停用',

  bulk_selecionados: '已选',
  bulk_ativar: '启用',
  bulk_inativar: '停用',
  bulk_excluir: '删除所选',
  bulk_limpar: '清除选择',
  toast_bulk_ativados: '供应商已启用。',
  toast_bulk_inativados: '供应商已停用。',
  toast_bulk_excluidos: '供应商已删除。',
  toast_bulk_excluidos_parcial: '已删除 {excluidos} 个,{bloqueados} 个因有未结账款被跳过。',

  vazio_titulo: '未找到供应商',
  vazio_sub: '尝试其他搜索词,或新建供应商。',

  aria_selecionar_pagina: '选择本页全部',
  aria_selecionar: '选择',

  confirmar_exclusao: '删除供应商',
  confirmar_descartar: '放弃修改?',
  confirmar_bulk_exclusao: '删除 {n} 个供应商?此操作不可撤销。',
  toast_excluido: '供应商已成功删除。',

  modal_novo_titulo: '新建供应商',
  modal_editar_titulo: '编辑供应商',
  modal_salvar: '保存修改',
  modal_cadastrar: '新建供应商',

  tipo_label: '主体类型',
  tipo_pf: 'PF — 个人',
  tipo_pj: 'PJ — 公司',
  field_nome: '姓名',
  field_razao_social: '公司名称 / 简称',
  field_cpf: 'CPF',
  field_cnpj: 'CNPJ',
  field_telefone: '电话',
  field_email: '邮箱',
  field_contato: '联系人',
  placeholder_contato: '例:Wang Lei(采购负责人)',
  field_categoria: '类别',
  placeholder_categoria: '装饰、珠宝、厨房、茶叶…',

  section_endereco: '地址',
  field_cep: '邮编',
  field_logradouro: '街道',
  field_numero: '门牌号',
  field_complemento: '附加',
  field_bairro: '街区',
  field_cidade: '城市',
  field_uf: '州',

  err_nome_obrigatorio: '请填写名称。',
  err_nome_curto: '至少 2 个字符。',
  err_doc_obrigatorio: '请填写证件号。',
  err_cpf_invalido: 'CPF 须为 11 位数字。',
  err_cnpj_invalido: 'CNPJ 须为 14 位数字。',
  err_email: '邮箱无效。',
  err_cep: '邮编须为 8 位数字。',
}
