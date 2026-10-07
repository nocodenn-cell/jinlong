import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  ClipboardCheck,
  ClipboardList,
  FileBarChart2,
  LayoutDashboard,
  Monitor,
  Package,
  Percent,
  Receipt,
  Rocket,
  ScrollText,
  Settings,
  ShieldOff,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  UserCog,
  Users,
  Wallet,
  Boxes,
  ContactRound,
} from 'lucide-react'
import { ROUTES } from '@/lib/navigation/routes'
import { executiveRelatoriosHref } from '@/lib/navigation/executiveViews'

export type AdminV2NavItem = {
  id: string
  href: string
  icon: LucideIcon
  labelOverridePt?: string
  /** Chave em admin.nav quando labelOverridePt ausente */
  dictKey?: string
  labelPt?: string
  labelCn?: string
  hint?: string
  /** Exibir só para perfil ADMIN (equipe interna FastProduct). */
  adminOnly?: boolean
}

/**
 * ANÁLISES — 5 abas executivas (BI), sempre visíveis no topo da sidebar.
 * Visão Geral = dashboard; demais = hub `/admin/relatorios?view=…`.
 */
export const ADMIN_V2_ANALISES_ITEMS: readonly AdminV2NavItem[] = [
  {
    id: 'visao-geral',
    href: ROUTES.admin.dashboard,
    icon: LayoutDashboard,
    labelOverridePt: 'Visão Geral',
    dictKey: 'dashboard',
    labelCn: '总览',
    hint: 'KPIs globais, tendência e alertas executivos.',
  },
  {
    id: 'vendas-caixas',
    href: executiveRelatoriosHref('vendas-caixas'),
    icon: ShoppingCart,
    labelOverridePt: 'Vendas & Caixas',
    dictKey: 'execVendasCaixas',
    labelCn: '销售与收银',
    hint: 'Picos horários, auditoria de caixas e detalhe de pedidos.',
  },
  {
    id: 'dre-financeiro',
    href: executiveRelatoriosHref('dre-financeiro'),
    icon: Wallet,
    labelOverridePt: 'DRE & Financeiro',
    dictKey: 'execDreFinanceiro',
    labelCn: '损益与财务',
    hint: 'DRE em cascata, fluxo de caixa e inadimplência.',
  },
  {
    id: 'produtos-estoque',
    href: executiveRelatoriosHref('produtos-estoque'),
    icon: Boxes,
    labelOverridePt: 'Produtos & Estoque',
    dictKey: 'execProdutosEstoque',
    labelCn: '商品与库存',
    hint: 'Curva ABC, encalhe, reposição e OC em trânsito.',
  },
  {
    id: 'crm-auditoria',
    href: executiveRelatoriosHref('crm-auditoria'),
    icon: ContactRound,
    labelOverridePt: 'CRM & Auditoria',
    dictKey: 'execCrmAuditoria',
    labelCn: '客户与审计',
    hint: 'RFV, performance de equipe e painel de perdas.',
  },
] as const

/**
 * OPERAÇÕES — ERP do dia a dia (colapsável na sidebar).
 * Cadastros e fluxos oficiais (Entity SSoT) permanecem aqui.
 */
export const ADMIN_V2_OPERACOES_ITEMS: readonly AdminV2NavItem[] = [
  {
    id: 'vendas',
    href: ROUTES.admin.vendas,
    icon: ShoppingCart,
    labelOverridePt: 'Vendas',
    dictKey: 'vendas',
    hint: 'Listagem operacional e gestão de vendas.',
  },
  {
    id: 'caixas',
    href: ROUTES.admin.caixas,
    icon: Receipt,
    labelOverridePt: 'Caixas',
    labelCn: '收银历史',
    hint: 'Histórico de abertura, fechamento e divergência de turnos.',
  },
  {
    id: 'produtos',
    href: ROUTES.admin.catalogo,
    icon: Tag,
    labelOverridePt: 'Catálogo',
    dictKey: 'produtos',
    hint: 'Produtos, categorias e marcas (abas no hub).',
  },
  {
    id: 'clientes',
    href: ROUTES.admin.clientes,
    icon: Users,
    labelOverridePt: 'Clientes',
    dictKey: 'clientes',
  },
  {
    id: 'funcionarios',
    href: ROUTES.admin.funcionarios,
    icon: UserCog,
    labelOverridePt: 'Funcionários',
    labelCn: '员工',
    dictKey: 'funcionarios',
    hint: 'Cadastro de operadores e gerentes da loja.',
  },
  {
    id: 'estoque',
    href: ROUTES.admin.estoque,
    icon: Package,
    labelOverridePt: 'Estoque',
    dictKey: 'estoque',
    hint: 'Saldos, recebimento, transferências e NF-e (abas no hub).',
  },
  {
    id: 'financeiro',
    href: ROUTES.admin.financeiro,
    icon: Banknote,
    labelOverridePt: 'Financeiro e fiscal',
    dictKey: 'financeiro',
  },
  {
    id: 'auditoria',
    href: ROUTES.admin.auditoria,
    icon: ScrollText,
    labelOverridePt: 'Auditoria',
    labelCn: '审计',
    hint: 'Linha do tempo de eventos operacionais.',
  },
  {
    id: 'fornecedores',
    href: ROUTES.admin.fornecedores,
    icon: Truck,
    labelOverridePt: 'Fornecedores',
    labelCn: '供应商',
  },
  {
    id: 'compras',
    href: ROUTES.admin.compras,
    icon: ClipboardList,
    labelOverridePt: 'Compras',
    labelCn: '采购',
  },
  {
    id: 'comissoes',
    href: ROUTES.admin.comissoes,
    icon: Percent,
    labelOverridePt: 'Comissões',
    dictKey: 'comissoes',
  },
  {
    id: 'relatorios-legado',
    href: ROUTES.admin.relatorios,
    icon: FileBarChart2,
    labelOverridePt: 'Relatórios (detalhe)',
    dictKey: 'relatorios',
    hint: 'Hub analítico legado — abas de detalhe por domínio.',
  },
] as const

export const ADMIN_V2_SISTEMA_ITEMS: readonly AdminV2NavItem[] = [
  {
    id: 'configuracoes',
    href: ROUTES.admin.configuracoes,
    icon: Settings,
    labelOverridePt: 'Configurações',
    dictKey: 'configuracoes',
  },
  {
    id: 'provisionamento',
    href: ROUTES.admin.provisionamento,
    icon: Store,
    labelOverridePt: 'Provisionamento',
    labelCn: '开通店铺',
    dictKey: 'provisionamento',
    hint: 'Wizard interno: criar loja + DONO sem SQL.',
    adminOnly: true,
  },
  {
    id: 'implantacao',
    href: ROUTES.admin.implantacao,
    icon: Rocket,
    labelOverridePt: 'Implantação / GO-LIVE',
    labelCn: '上线清单',
    dictKey: 'implantacao',
    hint: 'Gate oficial de GO-LIVE com checklist persistido.',
    adminOnly: true,
  },
  {
    id: 'diagnostico-caixa',
    href: ROUTES.admin.diagnosticoCaixa,
    icon: ClipboardCheck,
    labelOverridePt: 'Diagnóstico do Caixa',
    hint: 'Checklist pré-produção do PDV.',
    adminOnly: true,
  },
  {
    id: 'suspensao',
    href: ROUTES.admin.suspensao,
    icon: ShieldOff,
    labelOverridePt: 'Suspensão de vendas',
    dictKey: 'suspensao',
  },
  {
    id: 'pdv',
    href: ROUTES.caixa.home,
    icon: Monitor,
    labelPt: 'Ir para PDV',
    labelCn: '前往收银',
    hint: 'Abrir o terminal de caixa.',
  },
] as const

/** @deprecated Use ADMIN_V2_ANALISES_ITEMS — alias de migração Fase 1. */
export const ADMIN_V2_CORE_ITEMS = ADMIN_V2_ANALISES_ITEMS

/**
 * @deprecated Itens migrados para ADMIN_V2_OPERACOES_ITEMS.
 * Mantido vazio para testes/imports legados que ainda referenciam "Mais".
 */
export const ADMIN_V2_EXPANDED_ITEMS: readonly AdminV2NavItem[] = []
