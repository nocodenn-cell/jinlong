/**
 * Adicione no arquivo
 *   pdv-importados/i18n/messages.{pt,zh}.ts
 * (raiz: `categorias`)
 */

export const ptCategorias = {
  titulo: 'Categorias',
  subtitulo: 'Organize seus produtos por categoria. Categorias com produtos vinculados não podem ser excluídas.',
  placeholder_busca: 'Buscar por nome ou descrição…',
  nova: 'Nova categoria',
  editar: 'Editar',
  excluir: 'Excluir',

  col_nome: 'Nome',
  col_descricao: 'Descrição',
  col_produtos: 'Produtos',
  col_status: 'Status',
  col_acoes: 'Ações',
  status_ativo: 'Ativa',
  status_inativo: 'Inativa',

  vazio_titulo: 'Nenhuma categoria cadastrada',
  vazio_sub: 'Crie uma para começar a organizar seus produtos.',

  confirmar_exclusao: 'Excluir a categoria',
  confirmar_descartar: 'Descartar as alterações?',
  aviso_com_produtos: 'Esta categoria possui {n} produto(s) vinculado(s) e não pode ser excluída. Mova ou exclua os produtos antes.',
  toast_excluida: 'Categoria excluída.',

  modal_nova: 'Nova categoria',
  modal_editar: 'Editar categoria',
  field_nome: 'Nome',
  field_descricao: 'Descrição',
  placeholder_descricao: 'Use para detalhar o tipo de produto que entra nesta categoria (até 200 caracteres).',
  field_ativo: 'Categoria ativa',
  ativa_label: 'visível no catálogo',
  inativa_label: 'oculta para vendedores',
  btn_salvar: 'Salvar alterações',
  btn_cadastrar: 'Cadastrar categoria',

  err_nome_obrigatorio: 'Informe o nome.',
  err_nome_curto: 'Mínimo de 2 caracteres.',
  err_nome_longo: 'Máximo de 60 caracteres.',
  err_descricao_longa: 'Descrição muito longa (máx. 200 caracteres).',
}

export const zhCategorias: typeof ptCategorias = {
  titulo: '类别',
  subtitulo: '按类别组织商品。有商品的类别不能删除。',
  placeholder_busca: '按名称或描述搜索…',
  nova: '新建类别',
  editar: '编辑',
  excluir: '删除',

  col_nome: '名称',
  col_descricao: '描述',
  col_produtos: '商品数',
  col_status: '状态',
  col_acoes: '操作',
  status_ativo: '启用',
  status_inativo: '停用',

  vazio_titulo: '尚未创建类别',
  vazio_sub: '创建一个以开始组织商品。',

  confirmar_exclusao: '删除类别',
  confirmar_descartar: '放弃修改?',
  aviso_com_produtos: '此类别下有 {n} 个商品,无法删除。请先移走或删除这些商品。',
  toast_excluida: '类别已删除。',

  modal_nova: '新建类别',
  modal_editar: '编辑类别',
  field_nome: '名称',
  field_descricao: '描述',
  placeholder_descricao: '说明此类别包含的商品(最多 200 字)。',
  field_ativo: '类别启用',
  ativa_label: '在目录中可见',
  inativa_label: '对销售员隐藏',
  btn_salvar: '保存修改',
  btn_cadastrar: '新建类别',

  err_nome_obrigatorio: '请填写名称。',
  err_nome_curto: '至少 2 个字符。',
  err_nome_longo: '最多 60 个字符。',
  err_descricao_longa: '描述过长(最多 200 字)。',
}
