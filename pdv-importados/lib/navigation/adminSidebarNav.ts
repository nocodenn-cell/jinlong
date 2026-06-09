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
import { ROUTES } from '../../../shared-core/navigation/routes'

/** Ordem + ícones da sidebar `/admin`. */
export const ADMIN_SIDEBAR_NAV: ReadonlyArray<{
  href: string
  icon: LucideIcon
  dictKey: string
}> = [
  { href: ROUTES.admin.dashboard, icon: LayoutDashboard, dictKey: 'dashboard' },
  { href: ROUTES.gerente.home, icon: LayoutGrid, dictKey: 'gerente' },
  { href: ROUTES.admin.catalogo, icon: ShoppingBag, dictKey: 'produtos' },
  { href: ROUTES.admin.vendas, icon: ShoppingCart, dictKey: 'vendas' },
  { href: ROUTES.admin.estoque, icon: Package, dictKey: 'estoque' },
  { href: ROUTES.admin.estoqueRecebimento, icon: Inbox, dictKey: 'recebimento' },
  { href: ROUTES.admin.estoqueTransferencias, icon: ArrowRightLeft, dictKey: 'transferencias' },
  { href: ROUTES.admin.financeiro, icon: Coins, dictKey: 'financeiro' },
  { href: ROUTES.admin.vendas, icon: Building2, dictKey: 'caixas' },
  { href: ROUTES.admin.relatorios, icon: LineChart, dictKey: 'relatorios' },
] as const
