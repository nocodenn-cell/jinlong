import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  ArrowRightLeft,
  ClipboardCheck,
  ClipboardList,
  Rocket,
  FileBarChart2,
  FolderTree,
  Inbox,
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
  WalletCards,
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

export const ADMIN_V2_CORE_ITEMS: readonly AdminV2NavItem[] = [
  { id: 'dashboard', href: ROUTES.admin.dashboard, icon: LayoutDashboard, labelOverridePt: 'Visão geral', dictKey: 'dashboard' },
  { id: 'vendas', href: ROUTES.admin.vendas, icon: ShoppingCart, labelOverridePt: 'Vendas e caixa', dictKey: 'vendas' },
  { id: 'produtos', href: ROUTES.admin.catalogo, icon: Tag, labelOverridePt: 'Catálogo', dictKey: 'produtos' },
  {
    id: 'categorias-produtos',
    href: ROUTES.admin.categoriasProdutos,
    icon: FolderTree,
    labelOverridePt: 'Categorias de produtos',
    labelCn: '产品分类',
    hint: 'Criar e organizar as categorias usadas no catálogo.',
  },
  { id: 'clientes', href: ROUTES.admin.clientes, icon: Users, labelOverridePt: 'Clientes', dictKey: 'clientes' },
  {
    id: 'funcionarios',
    href: ROUTES.admin.funcionarios,
    icon: UserCog,
    labelOverridePt: 'Funcionários',
    labelCn: '员工',
    dictKey: 'funcionarios',
    hint: 'Cadastro de operadores e gerentes da loja.',
  },
  { id: 'estoque', href: ROUTES.admin.estoque, icon: Package, labelOverridePt: 'Estoque', dictKey: 'estoque' },
  { id: 'recebimento', href: ROUTES.admin.estoqueRecebimento, icon: Inbox, labelOverridePt: 'Recebimento', dictKey: 'recebimento' },
  {
    id: 'auditoria',
    href: ROUTES.admin.auditoria,
    icon: ScrollText,
    labelOverridePt: 'Auditoria',
    labelCn: '审计',
    hint: 'Linha do tempo de eventos operacionais.',
  },
  { id: 'financeiro', href: ROUTES.admin.financeiro, icon: Banknote, labelOverridePt: 'Financeiro e fiscal', dictKey: 'financeiro' },
  { id: 'relatorios', href: ROUTES.admin.relatorios, icon: FileBarChart2, labelOverridePt: 'Relatórios', dictKey: 'relatorios' },
] as const

export const ADMIN_V2_EXPANDED_ITEMS: readonly AdminV2NavItem[] = [
  { id: 'fornecedores', href: ROUTES.admin.fornecedores, icon: Truck, labelOverridePt: 'Fornecedores', labelCn: '供应商' },
  { id: 'compras', href: ROUTES.admin.compras, icon: ClipboardList, labelOverridePt: 'Compras', labelCn: '采购' },
  { id: 'transferencias', href: ROUTES.admin.estoqueTransferencias, icon: ArrowRightLeft, labelOverridePt: 'Transferências', dictKey: 'transferencias' },
  { id: 'comissoes', href: ROUTES.admin.comissoes, icon: Percent, labelOverridePt: 'Comissões', dictKey: 'comissoes' },
  {
    id: 'categorias-financeiras',
    href: ROUTES.admin.categoriasFinanceiras,
    icon: WalletCards,
    labelOverridePt: 'Categorias financeiras',
    labelCn: '财务分类',
    hint: 'Categorias de receita e despesa usadas no financeiro.',
  },
] as const

export const ADMIN_V2_SISTEMA_ITEMS: readonly AdminV2NavItem[] = [
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
  {
    id: 'pdv',
    href: ROUTES.caixa.home,
    icon: Monitor,
    labelPt: 'Ir para PDV',
    labelCn: '前往收银',
    hint: 'Abrir o terminal de caixa.',
  },
] as const
