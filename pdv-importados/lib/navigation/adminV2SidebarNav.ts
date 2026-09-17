import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  ClipboardCheck,
  ClipboardList,
  Rocket,
  FileBarChart2,
  LayoutDashboard,
  Monitor,
  Package,
  Percent,
  ScrollText,
  Settings,
  ShieldOff,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  UserCog,
  Users,
} from 'lucide-react'
import { ROUTES } from '@shared-core/navigation/routes'

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

export const ADMIN_V2_OPERACAO_ITEMS: readonly AdminV2NavItem[] = [
  { id: 'dashboard', href: ROUTES.admin.dashboard, icon: LayoutDashboard, labelOverridePt: 'Visão geral', dictKey: 'dashboard' },
  {
    id: 'pdv',
    href: ROUTES.caixa.home,
    icon: Monitor,
    labelPt: 'Ir para PDV',
    labelCn: '前往收银',
    hint: 'Abrir o terminal de caixa.',
  },
  { id: 'vendas', href: ROUTES.admin.vendas, icon: ShoppingCart, labelOverridePt: 'Vendas e caixa', dictKey: 'vendas' },
  {
    id: 'estoque',
    href: ROUTES.admin.estoque,
    icon: Package,
    labelOverridePt: 'Estoque',
    dictKey: 'estoque',
    hint: 'Saldos, recebimento, transferências e NF-e (abas no hub).',
  },
  { id: 'compras', href: ROUTES.admin.compras, icon: ClipboardList, labelOverridePt: 'Compras', labelCn: '采购' },
  { id: 'financeiro', href: ROUTES.admin.financeiro, icon: Banknote, labelOverridePt: 'Financeiro e fiscal', dictKey: 'financeiro' },
  { id: 'comissoes', href: ROUTES.admin.comissoes, icon: Percent, labelOverridePt: 'Comissões', dictKey: 'comissoes' },
] as const

export const ADMIN_V2_CADASTROS_ITEMS: readonly AdminV2NavItem[] = [
  {
    id: 'produtos',
    href: ROUTES.admin.catalogo,
    icon: Tag,
    labelOverridePt: 'Catálogo',
    dictKey: 'produtos',
    hint: 'Produtos, categorias e marcas (abas no hub).',
  },
  { id: 'clientes', href: ROUTES.admin.clientes, icon: Users, labelOverridePt: 'Clientes', dictKey: 'clientes' },
  { id: 'fornecedores', href: ROUTES.admin.fornecedores, icon: Truck, labelOverridePt: 'Fornecedores', labelCn: '供应商' },
] as const

export const ADMIN_V2_ANALISE_ITEMS: readonly AdminV2NavItem[] = [
  { id: 'relatorios', href: ROUTES.admin.relatorios, icon: FileBarChart2, labelOverridePt: 'Relatórios', dictKey: 'relatorios' },
] as const

export const ADMIN_V2_ADMINISTRACAO_ITEMS: readonly AdminV2NavItem[] = [
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
    id: 'auditoria',
    href: ROUTES.admin.auditoria,
    icon: ScrollText,
    labelOverridePt: 'Auditoria',
    labelCn: '审计',
    hint: 'Linha do tempo de eventos operacionais.',
  },
  { id: 'configuracoes', href: ROUTES.admin.configuracoes, icon: Settings, labelOverridePt: 'Configurações', dictKey: 'configuracoes' },
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
  { id: 'suspensao', href: ROUTES.admin.suspensao, icon: ShieldOff, labelOverridePt: 'Suspensão de vendas', dictKey: 'suspensao' },
] as const
