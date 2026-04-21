import type { LucideIcon } from 'lucide-react'
import {
  ArrowRightLeft,
  Building2,
  Coins,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  Package,
  ShoppingBag,
  ShoppingCart,
} from 'lucide-react'
import type { PainelGerencialNavKey } from './painelGerencialNav'

/** Ordem + ícones da sidebar `/admin` (alinhado ao hub → módulos /gerente). */
export const ADMIN_SIDEBAR_NAV: ReadonlyArray<{
  key: PainelGerencialNavKey
  icon: LucideIcon
}> = [
  { key: 'dashboard', icon: LayoutDashboard },
  { key: 'home', icon: LayoutGrid },
  { key: 'produtos', icon: ShoppingBag },
  { key: 'vendas', icon: ShoppingCart },
  { key: 'estoque', icon: Package },
  { key: 'recebimento', icon: Inbox },
  { key: 'transferencias', icon: ArrowRightLeft },
  { key: 'financeiro', icon: Coins },
  { key: 'caixas', icon: Building2 },
  { key: 'relatorios', icon: LineChart },
] as const
