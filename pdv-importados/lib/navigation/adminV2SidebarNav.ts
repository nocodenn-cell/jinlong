import type { LucideIcon } from 'lucide-react'
import {
  ArrowRightLeft,
  Building2,
  Coins,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  Monitor,
  Package,
  Percent,
  Settings,
  ShieldOff,
  ShoppingBag,
  ShoppingCart,
} from 'lucide-react'
import type { PainelGerencialNavKey } from './painelGerencialNav'

export type AdminV2NavItem =
  | {
      type: 'route'
      key: PainelGerencialNavKey
      icon: LucideIcon
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

export type AdminV2NavGroup = {
  id: 'gestao' | 'sistema'
  labelPt: string
  labelCn: string
  items: AdminV2NavItem[]
}

export const ADMIN_V2_SIDEBAR_GROUPS: readonly AdminV2NavGroup[] = [
  {
    id: 'gestao',
    labelPt: 'Gestão',
    labelCn: '管理',
    items: [
      { type: 'route', key: 'dashboard', icon: LayoutDashboard },
      { type: 'route', key: 'vendas', icon: ShoppingCart },
      { type: 'route', key: 'financeiro', icon: Coins },
      { type: 'route', key: 'relatorios', icon: LineChart },
      { type: 'route', key: 'estoque', icon: Package },
      { type: 'route', key: 'home', icon: LayoutGrid },
      { type: 'route', key: 'produtos', icon: ShoppingBag },
      { type: 'route', key: 'recebimento', icon: Inbox },
      { type: 'route', key: 'transferencias', icon: ArrowRightLeft },
      { type: 'route', key: 'caixas', icon: Building2 },
      { type: 'route', key: 'comissoes', icon: Percent },
    ],
  },
  {
    id: 'sistema',
    labelPt: 'Sistema',
    labelCn: '系统',
    items: [
      { type: 'route', key: 'configuracoes', icon: Settings },
      { type: 'route', key: 'suspensao', icon: ShieldOff },
      {
        type: 'link',
        id: 'pdv',
        href: '/caixa',
        icon: Monitor,
        labelPt: 'Ir para PDV',
        labelCn: '前往收银',
        hint: 'Abrir o terminal de caixa.',
      },
    ],
  },
] as const
