/**
 * Fonte única de rotas do produto.
 * Proibido usar strings `/admin/*`, `/caixa/*`, `/gerente/*` fora deste módulo.
 */
export const ROUTES = {
  auth: {
    login: '/login',
    signOut: '/auth/signout',
    forgotPassword: '/auth/esqueci-senha',
    resetPassword: '/auth/redefinir-senha',
    changePassword: '/auth/alterar-senha',
    callback: '/auth/callback',
  },
  onboarding: '/onboarding',
  caixa: {
    home: '/caixa',
    historico: '/caixa/historico',
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
    clientes: '/admin/clientes',
    funcionarios: '/admin/funcionarios',
    fornecedores: '/admin/fornecedores',
    estoque: '/admin/estoque',
    estoqueRecebimento: '/admin/estoque/recebimento',
    estoqueTransferencias: '/admin/estoque/transferencias',
    estoqueImprimirEtiquetas: '/admin/estoque/imprimir-etiquetas',
    importNfe: '/admin/estoque/importar-nfe',
    vendas: '/admin/vendas',
    auditoria: '/admin/auditoria',
    financeiro: '/admin/financeiro',
    financeiroContasPagar: '/admin/financeiro/contas-pagar',
    relatorios: '/admin/relatorios',
    comissoes: '/admin/comissoes',
    configuracoes: '/admin/configuracoes',
    implantacao: '/admin/implantacao',
    provisionamento: '/admin/provisionamento',
    suspensao: '/admin/suspensao',
    caixas: '/admin/caixas',
    diagnosticoCaixa: '/admin/diagnostico-caixa',
    categoriasProdutos: '/admin/categorias-produtos',
    marcasProdutos: '/admin/marcas-produtos',
    categoriasFinanceiras: '/admin/categorias-financeiras',
    compras: '/admin/compras',
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

export function adminFinanceiroDocumentoHref(id: string): string {
  return `${ROUTES.admin.financeiro}/documento/${id}`
}

export function adminEstoqueProdutoQuery(busca: string): string {
  const q = new URLSearchParams()
  if (busca.trim()) q.set('q', busca.trim())
  return pathWithQuery(ROUTES.admin.estoque, q)
}

/** Abre o recebimento manual com o produto já selecionado (ex.: a partir de um item crítico). */
export function adminEstoqueRecebimentoProdutoQuery(produtoId: string): string {
  const q = new URLSearchParams()
  if (produtoId.trim()) q.set('produto', produtoId.trim())
  return pathWithQuery(ROUTES.admin.estoqueRecebimento, q)
}

/** Abre "Nova OC" a partir de um fornecedor específico (ex.: lista de Fornecedores). */
export function adminComprasFornecedorQuery(fornecedorId: string): string {
  const q = new URLSearchParams()
  if (fornecedorId.trim()) q.set('fornecedor', fornecedorId.trim())
  return pathWithQuery(ROUTES.admin.compras, q)
}

/** Abre o detalhe de uma venda específica (ex.: a partir de uma linha de Relatórios). */
export function adminVendaDetalheQuery(vendaId: string): string {
  const q = new URLSearchParams()
  if (vendaId.trim()) q.set('venda', vendaId.trim())
  return pathWithQuery(ROUTES.admin.vendas, q)
}

export function adminEtiquetasProdutoQuery(opts: {
  codigo?: string | null
  produtoId?: string | null
}): string {
  const q = new URLSearchParams()
  if (opts.codigo?.trim()) q.set('codigo', opts.codigo.trim())
  if (opts.produtoId?.trim()) q.set('produto', opts.produtoId.trim())
  return pathWithQuery(ROUTES.admin.estoqueImprimirEtiquetas, q)
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
  'financeiro/contas-pagar': ROUTES.admin.financeiroContasPagar,
  relatorios: ROUTES.admin.relatorios,
  'relatorios/estoque': ROUTES.admin.relatorios,
  'relatorios/sem-giro': ROUTES.admin.relatorios,
  'relatorios/vendas': ROUTES.admin.relatorios,
  comissoes: ROUTES.admin.comissoes,
  configuracoes: ROUTES.admin.configuracoes,
  'categorias-produtos': ROUTES.admin.categoriasProdutos,
  'marcas-produtos': ROUTES.admin.marcasProdutos,
  'categorias-financeiras': ROUTES.admin.categoriasFinanceiras,
  suspensao: ROUTES.admin.suspensao,
  compras: ROUTES.admin.compras,
  clientes: ROUTES.admin.clientes,
  fornecedores: ROUTES.admin.fornecedores,
  caixas: ROUTES.admin.caixas,
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
