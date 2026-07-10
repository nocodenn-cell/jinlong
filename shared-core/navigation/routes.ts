/**
 * Fonte única de rotas do produto.
 * Proibido usar strings `/admin/*`, `/caixa/*`, `/gerente/*` fora deste módulo.
 */
export const ROUTES = {
  auth: {
    login: '/login',
    signOut: '/auth/signout',
  },
  onboarding: '/onboarding',
  caixa: {
    home: '/caixa',
  },
  gerente: {
    home: '/gerente',
    produtos: '/gerente/produtos',
    estoque: '/gerente/estoque',
    estoqueImportarNfe: '/gerente/estoque/importar-nfe',
    estoqueImprimirEtiquetas: '/gerente/estoque/imprimir-etiquetas',
    recebimento: '/gerente/recebimento',
    transferencias: '/gerente/transferencias',
    vendas: '/gerente/vendas',
    caixas: '/gerente/caixas',
    financeiro: '/gerente/financeiro',
    financeiroContasPagar: '/gerente/financeiro/contas-pagar',
    relatorios: '/gerente/relatorios',
    comissoes: '/gerente/comissoes',
    configuracoes: '/gerente/configuracoes',
    suspensao: '/gerente/suspensao',
    compras: '/gerente/compras',
    clientes: '/gerente/clientes',
    fornecedores: '/gerente/fornecedores',
    categoriasProdutos: '/gerente/categorias-produtos',
  },
  admin: {
    home: '/admin',
    dashboard: '/admin/dashboard',
    catalogo: '/admin/catalogo',
    catalogoNovo: '/admin/catalogo/novo',
    estoque: '/admin/estoque',
    estoqueRecebimento: '/admin/estoque/recebimento',
    estoqueTransferencias: '/admin/estoque/transferencias',
    estoqueImprimirEtiquetas: '/admin/estoque/imprimir-etiquetas',
    importNfe: '/admin/estoque/importar-nfe',
    vendas: '/admin/vendas',
    auditoria: '/admin/auditoria',
    clientes: '/admin/clientes',
    financeiro: '/admin/financeiro',
    relatorios: '/admin/relatorios',
    comissoes: '/admin/comissoes',
    configuracoes: '/admin/configuracoes',
    suspensao: '/admin/suspensao',
    categoriasProdutos: '/admin/categorias-produtos',
    categoriasFinanceiras: '/admin/categorias-financeiras',
  },
  catalogoPublic: {
    produtos: '/catalogo/produtos',
    produtosNovo: '/catalogo/produtos/novo',
  },
  legal: {
    termos: '/termos',
    privacidade: '/privacidade',
  },
  demo: {
    fluxo: '/demo-fluxo',
  },
} as const

export function adminCatalogoProdutoQuery(id: string): string {
  return `${ROUTES.admin.catalogo}?produto=${id}`
}

export function catalogoPublicProduto(id: string): string {
  return `${ROUTES.catalogoPublic.produtos}/${id}`
}

/** Redirects legados `/gerente/*` → rotas canônicas. */
export const LEGACY_GERENTE_REDIRECTS: Record<string, string> = {
  '': ROUTES.admin.dashboard,
  dashboard: ROUTES.admin.dashboard,
  produtos: ROUTES.admin.catalogo,
  'produtos/novo': ROUTES.admin.catalogoNovo,
  estoque: ROUTES.admin.estoque,
  'estoque/importar': ROUTES.admin.importNfe,
  'estoque/importar-nfe': ROUTES.admin.importNfe,
  'estoque/imprimir-etiquetas': ROUTES.admin.estoqueImprimirEtiquetas,
  'estoque/recebimento': ROUTES.admin.estoqueRecebimento,
  'estoque/transferencias': ROUTES.admin.estoqueTransferencias,
  recebimento: ROUTES.admin.estoqueRecebimento,
  transferencias: ROUTES.admin.estoqueTransferencias,
  vendas: ROUTES.admin.vendas,
  financeiro: ROUTES.admin.financeiro,
  'financeiro/contas-pagar': ROUTES.gerente.financeiroContasPagar,
  relatorios: ROUTES.admin.relatorios,
  'relatorios/estoque': ROUTES.admin.relatorios,
  'relatorios/sem-giro': ROUTES.admin.relatorios,
  'relatorios/vendas': ROUTES.admin.relatorios,
  comissoes: ROUTES.admin.comissoes,
  configuracoes: ROUTES.admin.configuracoes,
  'categorias-produtos': ROUTES.admin.categoriasProdutos,
  'categorias-financeiras': ROUTES.admin.categoriasFinanceiras,
  suspensao: ROUTES.admin.suspensao,
  compras: ROUTES.admin.catalogo,
  clientes: ROUTES.admin.clientes,
  fornecedores: ROUTES.admin.catalogo,
  caixas: ROUTES.admin.vendas,
  atividades: ROUTES.admin.dashboard,
}

export function legacyGerenteRedirect(slug: string): string {
  return LEGACY_GERENTE_REDIRECTS[slug] ?? ROUTES.admin.dashboard
}

export const ONBOARDING_STORAGE_KEY = 'fastproduct_onboarding_dismissed_v1' as const

/** Monta URL com query string opcional (paginação/filtros admin). */
export function pathWithQuery(base: string, params: URLSearchParams): string {
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}
