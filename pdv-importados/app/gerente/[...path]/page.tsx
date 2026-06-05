import { redirect } from 'next/navigation'

const ROTA_MAP: Record<string, string> = {
  '': '/admin/dashboard',
  'dashboard': '/admin/dashboard',
  'produtos': '/admin/catalogo',
  'produtos/novo': '/admin/catalogo/novo',
  'estoque': '/admin/estoque',
  'estoque/importar': '/admin/estoque/importar',
  'estoque/imprimir-etiquetas': '/admin/estoque',
  'vendas': '/admin/vendas',
  'financeiro': '/admin/financeiro',
  'financeiro/contas-pagar': '/admin/financeiro',
  'relatorios': '/admin/relatorios',
  'relatorios/estoque': '/admin/relatorios',
  'relatorios/sem-giro': '/admin/relatorios',
  'relatorios/vendas': '/admin/relatorios',
  'comissoes': '/admin/comissoes',
  'configuracoes': '/admin/configuracoes',
  'categorias-produtos': '/admin/categorias-produtos',
  'categorias-financeiras': '/admin/categorias-financeiras',
  'suspensao': '/admin/suspensao',
  'recebimento': '/admin/estoque',
  'transferencias': '/admin/estoque',
  'compras': '/admin/catalogo',
  'clientes': '/admin/catalogo',
  'fornecedores': '/admin/catalogo',
  'caixas': '/admin/dashboard',
  'atividades': '/admin/dashboard',
}

export default function GerenteRedirect({
  params,
}: {
  params: { path?: string[] }
}) {
  const slug = (params.path ?? []).join('/')
  const destino = ROTA_MAP[slug] ?? '/admin/dashboard'
  redirect(destino)
}
