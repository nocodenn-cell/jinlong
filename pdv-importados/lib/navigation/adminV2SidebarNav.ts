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
import type { PainelGerencialNavKey } from './painelGerencialNav'

export type AdminV2NavItem =
  | {
      type: 'route'
      key: PainelGerencialNavKey
      icon: LucideIcon
      labelOverridePt?: string
    }
  | {
      type: 'link'
      id: string
      href: string
      icon: LucideIcon
      labelPt: string
      labelCn: string
      hint: string
    }

export const ADMIN_V2_CORE_ITEMS: readonly AdminV2NavItem[] = [
  { type: 'route', key: 'dashboard', icon: LayoutDashboard, labelOverridePt: 'Visão geral' },
  { type: 'route', key: 'vendas', icon: ShoppingCart, labelOverridePt: 'Vendas e caixa' },
  { type: 'route', key: 'estoque', icon: Package, labelOverridePt: 'Estoque e catálogo' },
  { type: 'route', key: 'financeiro', icon: Banknote, labelOverridePt: 'Financeiro' },
] as const

export const ADMIN_V2_EXPANDED_ITEMS: readonly AdminV2NavItem[] = [
  { type: 'route', key: 'relatorios', icon: FileBarChart2, labelOverridePt: 'Relatórios' },
  { type: 'route', key: 'home', icon: Layers3, labelOverridePt: 'Painel gerencial' },
  { type: 'route', key: 'produtos', icon: Package, labelOverridePt: 'Produtos' },
  { type: 'route', key: 'recebimento', icon: Inbox, labelOverridePt: 'Recebimento' },
  { type: 'route', key: 'transferencias', icon: ArrowRightLeft, labelOverridePt: 'Transferências' },
  { type: 'route', key: 'caixas', icon: Building2, labelOverridePt: 'Caixas' },
  { type: 'route', key: 'comissoes', icon: Percent, labelOverridePt: 'Comissões' },
] as const

export const ADMIN_V2_SISTEMA_ITEMS: readonly AdminV2NavItem[] = [
  { type: 'route', key: 'configuracoes', icon: Settings, labelOverridePt: 'Configurações' },
  { type: 'route', key: 'suspensao', icon: ShieldOff, labelOverridePt: 'Suspensão de licença' },
  {
    type: 'link',
    id: 'pdv',
    href: '/caixa',
    icon: Monitor,
    labelPt: 'Ir para PDV',
    labelCn: '前往收银',
    hint: 'Abrir o terminal de caixa.',
  },
] as const
