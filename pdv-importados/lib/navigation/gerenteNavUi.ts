import type { Mensagens } from '@/i18n/getMessages'
import { ROUTES } from '@shared-core/navigation/routes'

/** Chaves de módulo para labels i18n (sem resolver href — usar GERENTE_NAV_HREF). */
export type PainelGerencialNavKey =
  | 'home'
  | 'dashboard'
  | 'produtos'
  | 'categorias_produtos'
  | 'categorias_financeiras'
  | 'clientes'
  | 'vendas'
  | 'estoque'
  | 'recebimento'
  | 'transferencias'
  | 'fornecedores'
  | 'financeiro'
  | 'comissoes'
  | 'contas_pagar'
  | 'configuracoes'
  | 'suspensao'
  | 'caixas'
  | 'relatorios'
  | 'relatorios_vendas'
  | 'compras'

/** Href canônico por chave de módulo — valores derivados exclusivamente de ROUTES. */
export const GERENTE_NAV_HREF: Record<PainelGerencialNavKey, string> = {
  home: ROUTES.gerente.home,
  dashboard: ROUTES.admin.dashboard,
  produtos: ROUTES.admin.catalogo,
  categorias_produtos: ROUTES.admin.categoriasProdutos,
  categorias_financeiras: ROUTES.admin.categoriasFinanceiras,
  clientes: ROUTES.admin.clientes,
  vendas: ROUTES.admin.vendas,
  estoque: ROUTES.admin.estoque,
  recebimento: ROUTES.admin.estoqueRecebimento,
  transferencias: ROUTES.admin.estoqueTransferencias,
  fornecedores: ROUTES.admin.fornecedores,
  financeiro: ROUTES.admin.financeiro,
  comissoes: ROUTES.admin.comissoes,
  contas_pagar: ROUTES.admin.financeiroContasPagar,
  configuracoes: ROUTES.admin.configuracoes,
  suspensao: ROUTES.admin.suspensao,
  caixas: ROUTES.admin.caixas,
  relatorios: ROUTES.admin.relatorios,
  relatorios_vendas: ROUTES.admin.relatorios,
  /** SSoT: compras ≠ recebimento; recebimento tem chave própria. */
  compras: ROUTES.admin.compras,
}

export type AdminNavDictionaryKey = keyof Mensagens['admin']['nav']

export function adminNavDictionaryKey(key: PainelGerencialNavKey): AdminNavDictionaryKey {
  if (key === 'home') return 'gerente'
  return key as AdminNavDictionaryKey
}

export function gerenteNavLabel(m: Mensagens, key: PainelGerencialNavKey): string {
  switch (key) {
    case 'home':
      return m.gerente.inicio
    case 'dashboard':
      return m.gerente.nav_admin
    case 'produtos':
      return m.produtos.titulo
    case 'categorias_produtos':
      return m.categorias_produtos.nav_label
    case 'categorias_financeiras':
      return m.categorias_financeiras.nav_label
    case 'clientes':
      return m.clientes.titulo
    case 'fornecedores':
      return m.fornecedores.titulo
    case 'estoque':
      return m.estoque.titulo
    case 'recebimento':
      return m.gerente.nav_recebimento
    case 'transferencias':
      return m.gerente.nav_transferencias
    case 'financeiro':
      return m.gerente.nav_financeiro
    case 'comissoes':
      return m.gerente.nav_comissoes
    case 'contas_pagar':
      return m.contas_pagar.titulo
    case 'configuracoes':
      return m.gerente.nav_configuracoes
    case 'suspensao':
      return m.gerente.nav_suspensao
    case 'vendas':
      return m.gerente.nav_vendas
    case 'caixas':
      return m.gerente.nav_caixas
    case 'relatorios':
      return m.gerente.nav_relatorios
    case 'relatorios_vendas':
      return m.relatorios_vendas.titulo
    case 'compras':
      return m.compras.titulo
    default: {
      const _exhaustive: never = key
      return _exhaustive
    }
  }
}

export const GERENTE_HEADER_NAV_ORDER: readonly PainelGerencialNavKey[] = [
  'home',
  'produtos',
  'estoque',
  'recebimento',
  'transferencias',
  'financeiro',
  'configuracoes',
  'vendas',
  'caixas',
  'relatorios',
  'dashboard',
] as const

export type GerenteNavTopicId =
  | 'inicio'
  | 'catalogo'
  | 'estoque_logistica'
  | 'vendas_caixa'
  | 'financeiro'
  | 'analise'
  | 'sistema'

export type GerenteNavTopic = {
  readonly id: GerenteNavTopicId
  readonly items: readonly PainelGerencialNavKey[]
}

export const GERENTE_NAV_TOPICS: readonly GerenteNavTopic[] = [
  { id: 'inicio', items: ['home'] },
  { id: 'catalogo', items: ['produtos', 'categorias_produtos', 'clientes'] },
  { id: 'estoque_logistica', items: ['estoque', 'recebimento', 'compras', 'transferencias', 'fornecedores'] },
  { id: 'vendas_caixa', items: ['vendas', 'caixas'] },
  { id: 'financeiro', items: ['financeiro', 'comissoes', 'categorias_financeiras', 'contas_pagar'] },
  { id: 'analise', items: ['relatorios', 'relatorios_vendas'] },
  { id: 'sistema', items: ['configuracoes', 'suspensao', 'dashboard'] },
] as const

function pathMatchesHref(href: string, pathname: string): boolean {
  if (href === ROUTES.gerente.home) return pathname === ROUTES.gerente.home
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function gerenteNavTopicIdForPathname(pathname: string | null): GerenteNavTopicId {
  if (!pathname) return 'inicio'
  for (const topic of GERENTE_NAV_TOPICS) {
    for (const key of topic.items) {
      if (pathMatchesHref(GERENTE_NAV_HREF[key], pathname)) return topic.id
    }
  }
  return 'inicio'
}

export function gerenteNavTopicLabel(m: Mensagens, id: GerenteNavTopicId): string {
  switch (id) {
    case 'inicio':
      return m.gerente.inicio
    case 'catalogo':
      return m.gerente.nav_topico_catalogo
    case 'estoque_logistica':
      return m.gerente.nav_topico_estoque_logistica
    case 'vendas_caixa':
      return m.gerente.nav_topico_vendas_caixa
    case 'financeiro':
      return m.gerente.nav_financeiro
    case 'analise':
      return m.gerente.nav_topico_analise
    case 'sistema':
      return m.gerente.nav_topico_sistema
    default: {
      const _e: never = id
      return _e
    }
  }
}

export function gerenteInicioAtalhoKeys(
  incluirTransferencias: boolean,
): readonly PainelGerencialNavKey[] {
  const base: PainelGerencialNavKey[] = [
    'produtos',
    'estoque',
    'recebimento',
    ...(incluirTransferencias ? (['transferencias'] as const) : []),
    'financeiro',
    'configuracoes',
    'vendas',
    'caixas',
    'relatorios',
    'dashboard',
  ]
  return base
}
