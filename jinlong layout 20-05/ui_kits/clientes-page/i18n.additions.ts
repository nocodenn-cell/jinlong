/**
 * Adicione estas chaves no arquivo
 *   pdv-importados/i18n/messages.{pt,zh}.ts
 * dentro do mesmo objeto (raiz: `clientes`).
 *
 * Esta página depende de:
 *   m.clientes.*       (novas — listadas abaixo)
 *   m.comum.cancelar, m.comum.sucesso, m.comum.carregando   (já existem)
 */

export const ptClientes = {
  titulo: 'Clientes',
  contagem: 'clientes',
  em_crediario: 'em crediário aberto',
  novo: 'Novo cliente',
  editar: 'Editar',
  excluir: 'Excluir',
  placeholder_busca: 'Buscar por nome, CPF/CNPJ, e-mail ou telefone…',

  // Tabela
  col_cliente: 'Cliente',
  col_documento: 'Documento',
  col_telefone: 'Telefone',
  col_saldo: 'Saldo crediário',
  col_acoes: 'Ações',

  // Vazio
  vazio_titulo: 'Nenhum cliente encontrado',
  vazio_sub: 'Tente outro termo de busca, ou cadastre um novo cliente.',

  // Confirmações
  confirmar_exclusao: 'Excluir o cliente',
  confirmar_descartar: 'Descartar as alterações?',
  toast_excluido: 'Cliente excluído com sucesso.',

  // Modal — comum
  saldo_atual: 'Saldo atual',
  modal_novo_titulo: 'Cadastrar cliente',
  modal_editar_titulo: 'Editar cliente',
  modal_salvar: 'Salvar alterações',
  modal_cadastrar: 'Cadastrar cliente',

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
  field_endereco: 'Endereço (opcional)',
  placeholder_endereco: 'Rua, número, bairro, cidade / UF',
  field_limite_crediario: 'Limite de crediário',
  hint_limite: 'Limite máximo de compras a prazo. Use 0 para desabilitar crediário.',

  // Erros de validação
  err_nome_obrigatorio: 'Informe o nome.',
  err_nome_curto: 'Mínimo de 2 caracteres.',
  err_doc_obrigatorio: 'Informe o documento.',
  err_cpf_invalido: 'CPF deve ter 11 dígitos.',
  err_cnpj_invalido: 'CNPJ deve ter 14 dígitos.',
  err_email: 'E-mail inválido.',
  err_telefone: 'Telefone incompleto.',
  err_limite_negativo: 'Limite não pode ser negativo.',
}

export const zhClientes: typeof ptClientes = {
  titulo: '客户',
  contagem: '客户',
  em_crediario: '挂账中',
  novo: '新建客户',
  editar: '编辑',
  excluir: '删除',
  placeholder_busca: '按姓名、CPF/CNPJ、邮箱或电话搜索…',

  col_cliente: '客户',
  col_documento: '证件号',
  col_telefone: '电话',
  col_saldo: '挂账余额',
  col_acoes: '操作',

  vazio_titulo: '未找到客户',
  vazio_sub: '尝试其他搜索词,或新建客户。',

  confirmar_exclusao: '删除客户',
  confirmar_descartar: '放弃修改?',
  toast_excluido: '客户已成功删除。',

  saldo_atual: '当前余额',
  modal_novo_titulo: '新建客户',
  modal_editar_titulo: '编辑客户',
  modal_salvar: '保存修改',
  modal_cadastrar: '新建客户',

  tipo_label: '客户类型',
  tipo_pf: 'PF — 个人',
  tipo_pj: 'PJ — 公司',
  field_nome: '姓名',
  field_razao_social: '公司名称 / 简称',
  field_cpf: 'CPF',
  field_cnpj: 'CNPJ',
  field_telefone: '电话',
  field_email: '邮箱',
  field_endereco: '地址(可选)',
  placeholder_endereco: '街道、门牌号、街区、城市/州',
  field_limite_crediario: '挂账额度',
  hint_limite: '最大挂账金额。设为 0 则不允许挂账。',

  err_nome_obrigatorio: '请填写姓名。',
  err_nome_curto: '至少 2 个字符。',
  err_doc_obrigatorio: '请填写证件号。',
  err_cpf_invalido: 'CPF 须为 11 位数字。',
  err_cnpj_invalido: 'CNPJ 须为 14 位数字。',
  err_email: '邮箱无效。',
  err_telefone: '电话不完整。',
  err_limite_negativo: '额度不能为负数。',
}
