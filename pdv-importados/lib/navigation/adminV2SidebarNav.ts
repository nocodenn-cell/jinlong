import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  ArrowRightLeft,
  Building2,
  FileBarChart2,
  Inbox,
  LayoutDashboard,
  Layers3,
  Monitor,
  Package,
  Percent,
  Settings,
  ShieldOff,
  ShoppingCart,
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
  { id: 'estoque', href: ROUTES.admin.estoque, icon: Package, labelOverridePt: 'Estoque e catálogo', dictKey: 'estoque' },
  { id: 'financeiro', href: ROUTES.admin.financeiro, icon: Banknote, labelOverridePt: 'Financeiro', dictKey: 'financeiro' },
] as const

export const ADMIN_V2_EXPANDED_ITEMS: readonly AdminV2NavItem[] = [
  { id: 'relatorios', href: ROUTES.admin.relatorios, icon: FileBarChart2, labelOverridePt: 'Relatórios', dictKey: 'relatorios' },
  { id: 'gerente', href: ROUTES.gerente.home, icon: Layers3, labelOverridePt: 'Painel gerencial', dictKey: 'gerente' },
  { id: 'produtos', href: ROUTES.admin.catalogo, icon: Package, labelOverridePt: 'Produtos', dictKey: 'produtos' },
  { id: 'recebimento', href: ROUTES.admin.estoqueRecebimento, icon: Inbox, labelOverridePt: 'Recebimento', dictKey: 'recebimento' },
  { id: 'transferencias', href: ROUTES.admin.estoqueTransferencias, icon: ArrowRightLeft, labelOverridePt: 'Transferências', dictKey: 'transferencias' },
  { id: 'caixas', href: ROUTES.admin.vendas, icon: Building2, labelOverridePt: 'Caixas', dictKey: 'caixas' },
  { id: 'comissoes', href: ROUTES.admin.comissoes, icon: Percent, labelOverridePt: 'Comissões', dictKey: 'comissoes' },
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
