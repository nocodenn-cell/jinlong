import type { Mensagens } from '@/i18n/getMessages'

/**
 * Chaves canónicas dos módulos do painel gerencial + dashboard admin.
 * Uma única fonte de hrefs — layouts /gerente e /admin e atalhos devem derivar daqui.
 */
export type PainelGerencialNavKey =
  | 'home'
  | 'dashboard'
  | 'produtos'
  | 'vendas'
  | 'estoque'
  | 'recebimento'
  | 'transferencias'
  | 'financeiro'
  | 'comissoes'
  | 'configuracoes'
  | 'suspensao'
  | 'caixas'
  | 'relatorios'

export function painelGerencialHref(key: PainelGerencialNavKey): string {
  if (key === 'home') return '/gerente'
  if (key === 'dashboard') return '/admin/dashboard'
  if (key === 'configuracoes') return '/gerente/configuracoes'
  if (key === 'comissoes') return '/gerente/comissoes'
  if (key === 'suspensao') return '/gerente/suspensao'
  return `/gerente/${key}`
}

/** Chave em `m.admin.nav` / `admin.navHints` (home = painel /gerente). */
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
    default: {
      const _exhaustive: never = key
      return _exhaustive
    }
  }
}

/** Ordem do header horizontal em `/gerente`. */
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

/** Agrupamento do header em tópicos (primeira linha) + abas (segunda linha, se >1 item). */
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
  { id: 'catalogo', items: ['produtos'] },
  { id: 'estoque_logistica', items: ['estoque', 'recebimento', 'transferencias'] },
  { id: 'vendas_caixa', items: ['vendas', 'caixas'] },
  { id: 'financeiro', items: ['financeiro', 'comissoes'] },
  { id: 'analise', items: ['relatorios'] },
  { id: 'sistema', items: ['configuracoes', 'suspensao', 'dashboard'] },
] as const

function pathMatchesGerenteHref(href: string, pathname: string): boolean {
  if (href === '/gerente') return pathname === '/gerente'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Tópico ativo conforme a rota atual (layout `/gerente`). */
export function gerenteNavTopicIdForPathname(pathname: string | null): GerenteNavTopicId {
  if (!pathname) return 'inicio'
  for (const topic of GERENTE_NAV_TOPICS) {
    for (const key of topic.items) {
      if (pathMatchesGerenteHref(painelGerencialHref(key), pathname)) return topic.id
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

/** Ordem dos atalhos na página inicial `/gerente` (sem “início”; transferências opcional). */
export function gerenteInicioAtalhoKeys(
  incluirTransferencias: boolean
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
