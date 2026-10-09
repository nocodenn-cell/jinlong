import { ROUTES } from '@/lib/navigation/routes'
import {
  ADMIN_V2_DESTINATIONS,
  ADMIN_V2_INTERNO_ITEMS,
  ADMIN_V2_PDV_ITEM,
  type AdminV2NavItem,
} from '@/lib/navigation/adminV2SidebarNav'
import { resolveNavLabels, type NavLabelsCtx } from '@/lib/navigation/resolveNavLabels'
import { financeiroHrefForTab } from '@/lib/navigation/financeiroHubQuery'
import { FINANCEIRO_TAB_ORDER, type FinanceiroTabId } from '@/lib/navigation/financeiroTabId'
import { buildCatalogoHubTabs, buildEstoqueHubTabs, hubLabelsFromAdminUi } from '@/lib/navigation/hubNavLabels'
import {
  buildOperationalHubTabs,
  operationalHubLabelsFromAdminUi,
  OPERATIONAL_HUB_IDS,
} from '@/lib/navigation/operationalHubNav'

/**
 * Paleta de comandos (Ctrl+K) — escopo desta entrega: DESTINOS e AÇÕES DE NAVEGAÇÃO.
 * Sem consulta ao banco: nada aqui lê produto, cliente ou venda, então não há RLS nem
 * latência a considerar. Busca de entidades é uma etapa futura.
 *
 * Visibilidade: usa a mesma regra da sidebar (`adminOnly`). A autorização real continua
 * sendo da policy no servidor; a paleta nunca é um controle de acesso.
 */
export type CommandEntry = {
  id: string
  href: string
  label: string
  /** Rótulo no outro idioma (ajuda a achar digitando em PT mesmo com a UI em ZH). */
  secondary: string
  /** Seção a que pertence (rótulo do destino da sidebar). */
  group: string
  kind: 'destino' | 'acao'
  /** Sinônimos em português (a busca também casa por eles; não aparecem na tela). */
  keywords: string
}

type AdminUi = Parameters<typeof hubLabelsFromAdminUi>[0] &
  Parameters<typeof operationalHubLabelsFromAdminUi>[0] & {
    hub_financeiro_resumo: string
    hub_financeiro_contas: string
    hub_financeiro_recebiveis: string
    hub_financeiro_conciliacao: string
    hub_financeiro_resultado: string
    command_palette_acao_novo_produto: string
  }

/**
 * Como o lojista fala, não como o menu chama: "contas a pagar" acha a aba "A pagar".
 * Chave = href canônico. Termos em PT (a UI em ZH também aceita digitar em PT via `secondary`).
 */
const KEYWORDS: Readonly<Record<string, string>> = {
  [ROUTES.admin.caixas]: 'turno fechamento sangria suprimento divergencia',
  [ROUTES.admin.vendas]: 'comprovante reimprimir cancelamento devolucao cupom',
  [ROUTES.admin.comissoes]: 'comissao vendedor liquidacao pagar comissoes',
  [ROUTES.admin.fornecedores]: 'compra cnpj',
  [ROUTES.admin.compras]: 'pedido ordem de compra oc',
  [ROUTES.admin.estoqueRecebimento]: 'receber mercadoria entrada conferencia',
  [ROUTES.admin.importNfe]: 'xml nota fiscal entrada nfe',
  [ROUTES.admin.estoqueImprimirEtiquetas]: 'codigo de barras gondola preco',
  [ROUTES.admin.estoqueMovimentacoes]: 'kardex historico ajuste',
  [ROUTES.admin.categoriasFinanceiras]: 'plano de contas despesas receitas',
  [ROUTES.admin.suspensao]: 'bloquear liberar vendas pdv',
  [ROUTES.admin.auditoria]: 'log historico quem alterou',
  [ROUTES.admin.catalogoNovo]: 'cadastrar criar produto preco atacado varejo',
  [ROUTES.admin.configuracoes]: 'loja impostos cnpj logo impressao idioma',
  '/admin/financeiro?tab=receber': 'contas a receber fiado cobranca clientes devedores',
  '/admin/financeiro?tab=pagar': 'contas a pagar boletos despesas vencimento',
  '/admin/financeiro?tab=recebiveis': 'pix cartao maquininha taxa',
  '/admin/financeiro?tab=conciliacao': 'extrato banco conferir',
  '/admin/financeiro?tab=fiscal': 'nota fiscal documentos nfe nfce',
  '/admin/financeiro?tab=resultado': 'dre lucro resultado do mes',
  '/admin/financeiro?tab=resumo': 'fluxo de caixa saldo',
  '/admin/financeiro?tab=contas': 'bancos saldos contas bancarias',
}

export type BuildEntriesInput = NavLabelsCtx & {
  adminUi: AdminUi
  showAdminOnlyItems: boolean
}

const FINANCEIRO_LABEL_KEY: Record<FinanceiroTabId, keyof AdminUi> = {
  resumo: 'hub_financeiro_resumo',
  receber: 'hub_financeiro_receber',
  pagar: 'hub_financeiro_pagar',
  contas: 'hub_financeiro_contas',
  recebiveis: 'hub_financeiro_recebiveis',
  conciliacao: 'hub_financeiro_conciliacao',
  resultado: 'hub_financeiro_resultado',
  fiscal: 'hub_financeiro_fiscal',
}

export function buildCommandEntries(input: BuildEntriesInput): CommandEntry[] {
  const { adminUi: ui, showAdminOnlyItems } = input
  const entries: CommandEntry[] = []
  const seen = new Set<string>()

  const push = (e: Omit<CommandEntry, 'keywords'>) => {
    if (seen.has(e.href)) return
    seen.add(e.href)
    entries.push({ ...e, keywords: KEYWORDS[e.href] ?? '' })
  }
  const fromItem = (item: AdminV2NavItem, group: string, kind: CommandEntry['kind'] = 'destino') => {
    if (item.adminOnly && !showAdminOnlyItems) return
    const l = resolveNavLabels(item, input)
    push({ id: item.id, href: item.href, label: l.primary, secondary: l.secondary, group, kind })
  }
  const groupOf = (destId: string): string => {
    const d = ADMIN_V2_DESTINATIONS.find((x) => x.id === destId)
    return d ? resolveNavLabels(d, input).primary : ''
  }
  const tab = (id: string, href: string, label: string, destId: string) =>
    push({ id, href, label, secondary: '', group: groupOf(destId), kind: 'destino' })

  // 1) Sidebar: destinos, sub-links, PDV e (se ADMIN) internos.
  fromItem(ADMIN_V2_PDV_ITEM, '', 'acao')
  for (const d of ADMIN_V2_DESTINATIONS) {
    const g = resolveNavLabels(d, input).primary
    fromItem(d, g)
    for (const c of d.children ?? []) fromItem(c, g)
  }

  // 2) Abas dos hubs (rotas que não estão na sidebar).
  for (const t of buildCatalogoHubTabs(hubLabelsFromAdminUi(ui))) tab(`hub-catalogo-${t.id}`, t.href, t.label, 'produtos')
  for (const t of buildEstoqueHubTabs(hubLabelsFromAdminUi(ui))) tab(`hub-estoque-${t.id}`, t.href, t.label, 'estoque')
  const opLabels = operationalHubLabelsFromAdminUi(ui)
  const hubDest = { vendas: 'vendas', compras: 'compras', pessoas: 'pessoas' } as const
  for (const hub of OPERATIONAL_HUB_IDS) {
    for (const t of buildOperationalHubTabs(hub, opLabels)) tab(`hub-${hub}-${t.id}`, t.href, t.label, hubDest[hub])
  }
  for (const id of FINANCEIRO_TAB_ORDER) {
    tab(`hub-financeiro-${id}`, financeiroHrefForTab(id, new URLSearchParams()), ui[FINANCEIRO_LABEL_KEY[id]] as string, 'financeiro')
  }
  tab('hub-financeiro-categorias', ROUTES.admin.categoriasFinanceiras, ui.hub_financeiro_categorias, 'financeiro')
  tab('hub-estoque-importar-nfe', ROUTES.admin.importNfe, ui.hub_estoque_importar_nfe, 'estoque')

  // 3) Ações de navegação (abrem a tela já no ponto de partida da tarefa).
  push({
    id: 'acao-novo-produto',
    href: ROUTES.admin.catalogoNovo,
    label: ui.command_palette_acao_novo_produto,
    secondary: '',
    group: groupOf('produtos'),
    kind: 'acao',
  })

  // Internos (ADMIN) entram por último, já filtrados.
  const internoGroup = input.chineseLanguage ? input.admin.nav.interno.cn : input.admin.nav.interno.pt
  for (const item of ADMIN_V2_INTERNO_ITEMS) fromItem(item, internoGroup)

  return entries
}

/** Normaliza para busca: minúsculas, sem acento. Han (中文) passa intacto. */
export function normalizeForSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Filtra e ordena. Todos os termos digitados precisam aparecer em algum campo.
 * Ordem: começa com o termo > palavra começa com o termo > contém.
 */
export function searchCommandEntries(entries: readonly CommandEntry[], query: string): CommandEntry[] {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...entries]
  const scored: Array<{ e: CommandEntry; score: number; i: number }> = []
  entries.forEach((e, i) => {
    const label = normalizeForSearch(e.label)
    const hay = `${label} ${normalizeForSearch(e.secondary)} ${normalizeForSearch(e.group)} ${e.keywords}`
    if (!terms.every((t) => hay.includes(t))) return
    let score = 2
    if (terms.every((t) => label.startsWith(t) || label.split(/[\s&/-]+/).some((w) => w.startsWith(t)))) score = 1
    if (label.startsWith(terms[0]!)) score = 0
    scored.push({ e, score, i })
  })
  return scored.sort((a, b) => a.score - b.score || a.i - b.i).map((s) => s.e)
}
