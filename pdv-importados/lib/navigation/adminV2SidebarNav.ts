import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  ArrowRightLeft,
  FileBarChart2,
  Inbox,
  LayoutDashboard,
  Layers3,
  Monitor,
  Package,
  Percent,
  ScrollText,
  Settings,
  ShieldOff,
  ShoppingCart,
  Tag,
  Users,
  Wallet,
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

/**
 * Módulos operacionais — sempre visíveis, ordenados como no Bling:
 * Início → Produtos → Estoque → Recebimento → Transferências → Vendas → Financeiro → Relatórios
 */
export const ADMIN_V2_MAIN_ITEMS: readonly AdminV2NavItem[] = [
  {
    id: 'dashboard',
    href: ROUTES.admin.dashboard,
    icon: LayoutDashboard,
    labelOverridePt: 'Início',
    dictKey: 'dashboard',
  },
  {
    id: 'produtos',
    href: ROUTES.admin.catalogo,
    icon: Tag,
    labelOverridePt: 'Produtos',
    dictKey: 'produtos',
  },
  {
    id: 'estoque',
    href: ROUTES.admin.estoque,
    icon: Package,
    labelOverridePt: 'Estoque',
    dictKey: 'estoque',
  },
  {
    id: 'recebimento',
    href: ROUTES.admin.estoqueRecebimento,
    icon: Inbox,
    labelOverridePt: 'Recebimento',
    dictKey: 'recebimento',
  },
  {
    id: 'transferencias',
    href: ROUTES.admin.estoqueTransferencias,
    icon: ArrowRightLeft,
    labelOverridePt: 'Transferências',
    dictKey: 'transferencias',
  },
  {
    id: 'vendas',
    href: ROUTES.admin.vendas,
    icon: ShoppingCart,
    labelOverridePt: 'Vendas',
    dictKey: 'vendas',
  },
  {
    id: 'caixa',
    href: ROUTES.admin.caixa,
    icon: Wallet,
    labelOverridePt: 'Caixa',
  },
  {
    id: 'financeiro',
    href: ROUTES.admin.financeiro,
    icon: Banknote,
    labelOverridePt: 'Financeiro',
    dictKey: 'financeiro',
  },
  {
    id: 'relatorios',
    href: ROUTES.admin.relatorios,
    icon: FileBarChart2,
    labelOverridePt: 'Relatórios',
    dictKey: 'relatorios',
  },
] as const

/**
 * @deprecated Use ADMIN_V2_MAIN_ITEMS. Mantido para não quebrar imports existentes.
 */
export const ADMIN_V2_CORE_ITEMS = ADMIN_V2_MAIN_ITEMS

/**
 * @deprecated Seção removida — todos os itens migrados para MAIN ou SISTEMA.
 */
export const ADMIN_V2_EXPANDED_ITEMS: readonly AdminV2NavItem[] = [] as const

/**
 * Administração do sistema — sempre visíveis, no final do menu.
 */
export const ADMIN_V2_SISTEMA_ITEMS: readonly AdminV2NavItem[] = [
  {
    id: 'usuarios',
    href: ROUTES.admin.usuarios,
    icon: Users,
    labelOverridePt: 'Usuários',
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
    id: 'comissoes',
    href: ROUTES.admin.comissoes,
    icon: Percent,
    labelOverridePt: 'Comissões',
    dictKey: 'comissoes',
  },
  {
    id: 'gerente',
    href: ROUTES.gerente.home,
    icon: Layers3,
    labelOverridePt: 'Painel Gerencial',
    dictKey: 'gerente',
  },
  {
    id: 'configuracoes',
    href: ROUTES.admin.configuracoes,
    icon: Settings,
    labelOverridePt: 'Configurações',
    dictKey: 'configuracoes',
  },
  {
    id: 'suspensao',
    href: ROUTES.admin.suspensao,
    icon: ShieldOff,
    labelOverridePt: 'Suspensão de licença',
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
