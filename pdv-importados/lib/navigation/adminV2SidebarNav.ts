import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  ArrowRightLeft,
  FileBarChart2,
  Inbox,
  LayoutDashboard,
  Monitor,
  Package,
  Percent,
  ScrollText,
  Settings,
  ShieldOff,
  ShoppingCart,
  Tag,
  Users,
  UserCog,
  Truck,
  ClipboardList,
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
}

export const ADMIN_V2_CORE_ITEMS: readonly AdminV2NavItem[] = [
  { id: 'dashboard', href: ROUTES.admin.dashboard, icon: LayoutDashboard, labelOverridePt: 'Visão geral', dictKey: 'dashboard' },
  { id: 'vendas', href: ROUTES.admin.vendas, icon: ShoppingCart, labelOverridePt: 'Vendas e caixa', dictKey: 'vendas' },
  { id: 'produtos', href: ROUTES.admin.catalogo, icon: Tag, labelOverridePt: 'Catálogo', dictKey: 'produtos' },
  { id: 'estoque', href: ROUTES.admin.estoque, icon: Package, labelOverridePt: 'Estoque', dictKey: 'estoque' },
  {
    id: 'auditoria',
    href: ROUTES.admin.auditoria,
    icon: ScrollText,
    labelOverridePt: 'Auditoria',
    labelCn: '审计',
    hint: 'Linha do tempo de eventos operacionais.',
  },
  { id: 'financeiro', href: ROUTES.admin.financeiro, icon: Banknote, labelOverridePt: 'Financeiro e fiscal', dictKey: 'financeiro' },
] as const

export const ADMIN_V2_EXPANDED_ITEMS: readonly AdminV2NavItem[] = [
  { id: 'clientes', href: ROUTES.admin.clientes, icon: Users, labelOverridePt: 'Clientes', labelCn: '客户' },
  { id: 'fornecedores', href: ROUTES.admin.fornecedores, icon: Truck, labelOverridePt: 'Fornecedores', labelCn: '供应商' },
  { id: 'compras', href: ROUTES.admin.compras, icon: ClipboardList, labelOverridePt: 'Compras', labelCn: '采购' },
  { id: 'relatorios', href: ROUTES.admin.relatorios, icon: FileBarChart2, labelOverridePt: 'Relatórios', dictKey: 'relatorios' },
  { id: 'recebimento', href: ROUTES.admin.estoqueRecebimento, icon: Inbox, labelOverridePt: 'Recebimento', dictKey: 'recebimento' },
  { id: 'transferencias', href: ROUTES.admin.estoqueTransferencias, icon: ArrowRightLeft, labelOverridePt: 'Transferências', dictKey: 'transferencias' },
  { id: 'comissoes', href: ROUTES.admin.comissoes, icon: Percent, labelOverridePt: 'Comissões', dictKey: 'comissoes' },
  { id: 'funcionarios', href: ROUTES.admin.funcionarios, icon: UserCog, labelOverridePt: 'Funcionários', labelCn: '员工' },
] as const

export const ADMIN_V2_SISTEMA_ITEMS: readonly AdminV2NavItem[] = [
  { id: 'configuracoes', href: ROUTES.admin.configuracoes, icon: Settings, labelOverridePt: 'Configurações', dictKey: 'configuracoes' },
  { id: 'suspensao', href: ROUTES.admin.suspensao, icon: ShieldOff, labelOverridePt: 'Suspensão de licença', dictKey: 'suspensao' },
  {
    id: 'pdv',
    href: ROUTES.caixa.home,
    icon: Monitor,
    labelPt: 'Ir para PDV',
    labelCn: '前往收银',
    hint: 'Abrir o terminal de caixa.',
  },
] as const
