import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeftRight,
  BarChart3,
  FileUp,
  LayoutDashboard,
  Package,
  Receipt,
  ShoppingCart,
  Tag,
  Truck,
  Warehouse,
  Wallet,
} from 'lucide-react'
import type { Mensagens } from '@/i18n/getMessages'

export type MegaNavLinkItem = Readonly<{
  href: string
  icon: LucideIcon
  label: (m: Mensagens) => string
}>

export type MegaNavColumn = Readonly<{
  heading: (m: Mensagens) => string
  items: readonly MegaNavLinkItem[]
}>

export type MegaNavGroup = Readonly<{
  id: string
  title: (m: Mensagens) => string
  columns: readonly MegaNavColumn[]
}>

/** Grupos do mega-menu do header `/gerente` (rotas reais apenas). */
export const GERENTE_MEGA_NAV_GROUPS: readonly MegaNavGroup[] = [
  {
    id: 'cadastros',
    title: (m) => m.gerente.nav_grupo_cadastros,
    columns: [
      {
        heading: (m) => m.gerente.nav_col_principais,
        items: [
          {
            href: '/gerente/produtos',
            icon: Package,
            label: (m) => m.produtos.titulo,
          },
        ],
      },
    ],
  },
  {
    id: 'vendas',
    title: (m) => m.gerente.nav_grupo_vendas,
    columns: [
      {
        heading: (m) => m.gerente.nav_col_principais,
        items: [
          {
            href: '/gerente/vendas',
            icon: ShoppingCart,
            label: (m) => m.gerente.nav_vendas,
          },
          {
            href: '/gerente/caixas',
            icon: Wallet,
            label: (m) => m.gerente.nav_caixas,
          },
        ],
      },
    ],
  },
  {
    id: 'financeiro',
    title: (m) => m.gerente.nav_grupo_financeiro,
    columns: [
      {
        heading: (m) => m.gerente.nav_col_principais,
        items: [
          {
            href: '/gerente/financeiro',
            icon: Receipt,
            label: (m) => m.gerente.nav_financeiro,
          },
        ],
      },
      {
        heading: (m) => m.gerente.nav_col_auxiliares,
        items: [
          {
            href: '/gerente/relatorios',
            icon: BarChart3,
            label: (m) => m.gerente.nav_relatorios,
          },
        ],
      },
    ],
  },
  {
    id: 'estoque',
    title: (m) => m.gerente.nav_grupo_estoque,
    columns: [
      {
        heading: (m) => m.gerente.nav_col_principais,
        items: [
          {
            href: '/gerente/estoque',
            icon: Warehouse,
            label: (m) => m.estoque.titulo,
          },
          {
            href: '/gerente/recebimento',
            icon: Truck,
            label: (m) => m.gerente.nav_recebimento,
          },
          {
            href: '/gerente/transferencias',
            icon: ArrowLeftRight,
            label: (m) => m.gerente.nav_transferencias,
          },
        ],
      },
      {
        heading: (m) => m.gerente.nav_col_auxiliares,
        items: [
          {
            href: '/gerente/estoque/imprimir-etiquetas',
            icon: Tag,
            label: (m) => m.gerente.nav_estoque_etiquetas,
          },
          {
            href: '/gerente/estoque/importar-nfe',
            icon: FileUp,
            label: (m) => m.gerente.nav_estoque_importar_nfe,
          },
        ],
      },
    ],
  },
  {
    id: 'config',
    title: (m) => m.gerente.nav_grupo_config,
    columns: [
      {
        heading: (m) => m.gerente.nav_col_principais,
        items: [
          {
            href: '/admin/dashboard',
            icon: LayoutDashboard,
            label: (m) => m.gerente.nav_admin,
          },
        ],
      },
    ],
  },
] as const

export function megaNavGroupIsActive(group: MegaNavGroup, pathname: string | null): boolean {
  if (!pathname) return false
  return group.columns.some((col) =>
    col.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)),
  )
}
