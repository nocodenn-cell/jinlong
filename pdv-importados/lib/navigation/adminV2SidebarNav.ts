import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  ClipboardCheck,
  ClipboardList,
  FileBarChart2,
  LayoutDashboard,
  Monitor,
  Package,
  Rocket,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  Users,
} from 'lucide-react'
import { ROUTES } from '@/lib/navigation/routes'
import { executiveRelatoriosHref } from '@/lib/navigation/executiveViews'

export type AdminV2NavItem = {
  id: string
  href: string
  icon?: LucideIcon
  labelOverridePt?: string
  /** Chave em admin.nav quando labelOverridePt ausente */
  dictKey?: string
  labelPt?: string
  labelCn?: string
  hint?: string
  /** Exibir só para perfil ADMIN (equipe interna FastProduct). */
  adminOnly?: boolean
}

/**
 * Destino principal da sidebar. `href` é a página padrão do grupo; `children` são as
 * OUTRAS páginas do mesmo assunto (nunca repetem o `href` do pai) e só aparecem
 * quando o grupo está aberto. Rotas e permissões não mudam — é só agrupamento
 * de acesso (UX-IA-01, PR 1).
 */
export type AdminV2NavDestination = AdminV2NavItem & {
  icon: LucideIcon
  children?: readonly AdminV2NavItem[]
}

/**
 * Navegação principal — 9 destinos por tarefa do usuário.
 * Rotas de tabs de hub (Catálogo, Estoque, Financeiro) continuam nas barras de aba das páginas.
 */
export const ADMIN_V2_DESTINATIONS: readonly AdminV2NavDestination[] = [
  {
    id: 'inicio',
    href: ROUTES.admin.dashboard,
    icon: LayoutDashboard,
    labelOverridePt: 'Início',
    dictKey: 'inicio',
    hint: 'KPIs globais, tendência e alertas.',
  },
  {
    id: 'vendas',
    href: ROUTES.admin.vendas,
    icon: ShoppingCart,
    labelOverridePt: 'Vendas',
    dictKey: 'vendas',
    hint: 'Listagem operacional de vendas, comprovantes e cancelamentos.',
    children: [
      {
        id: 'caixas',
        href: ROUTES.admin.caixas,
        labelOverridePt: 'Caixas',
        labelCn: '收银历史',
        hint: 'Histórico de abertura, fechamento e divergência de turnos.',
      },
    ],
  },
  {
    id: 'produtos',
    href: ROUTES.admin.catalogo,
    icon: Tag,
    labelOverridePt: 'Produtos',
    dictKey: 'produtos',
    hint: 'Produtos, categorias, marcas e etiquetas (abas na página).',
  },
  {
    id: 'estoque',
    href: ROUTES.admin.estoque,
    icon: Package,
    labelOverridePt: 'Estoque',
    dictKey: 'estoque',
    hint: 'Saldos, entradas, movimentações e transferências (abas na página).',
  },
  {
    id: 'compras',
    href: ROUTES.admin.compras,
    icon: ClipboardList,
    labelOverridePt: 'Compras',
    dictKey: 'compras',
    hint: 'Pedidos de compra e fornecedores.',
    children: [
      {
        id: 'fornecedores',
        href: ROUTES.admin.fornecedores,
        labelOverridePt: 'Fornecedores',
        dictKey: 'fornecedores',
      },
    ],
  },
  {
    id: 'financeiro',
    href: ROUTES.admin.financeiro,
    icon: Banknote,
    labelOverridePt: 'Financeiro',
    dictKey: 'financeiro',
    hint: 'Contas a receber e pagar, conciliação e fiscal (abas na página).',
    children: [
      {
        id: 'comissoes',
        href: ROUTES.admin.comissoes,
        labelOverridePt: 'Comissões',
        dictKey: 'comissoes',
      },
    ],
  },
  {
    id: 'pessoas',
    href: ROUTES.admin.clientes,
    icon: Users,
    labelOverridePt: 'Pessoas',
    dictKey: 'pessoas',
    hint: 'Clientes e funcionários da loja.',
    children: [
      {
        id: 'funcionarios',
        href: ROUTES.admin.funcionarios,
        labelOverridePt: 'Funcionários',
        dictKey: 'funcionarios',
        hint: 'Cadastro de operadores e gerentes da loja.',
      },
    ],
  },
  {
    id: 'relatorios',
    href: executiveRelatoriosHref('vendas-caixas'),
    icon: FileBarChart2,
    labelOverridePt: 'Relatórios',
    dictKey: 'relatorios',
    hint: 'Vendas, resultado, produtos, clientes e auditoria.',
    children: [
      {
        id: 'dre-financeiro',
        href: executiveRelatoriosHref('dre-financeiro'),
        labelOverridePt: 'DRE & Financeiro',
        dictKey: 'execDreFinanceiro',
        labelCn: '损益与财务',
      },
      {
        id: 'produtos-estoque',
        href: executiveRelatoriosHref('produtos-estoque'),
        labelOverridePt: 'Produtos & Estoque',
        dictKey: 'execProdutosEstoque',
        labelCn: '商品与库存',
      },
      {
        id: 'crm-auditoria',
        href: executiveRelatoriosHref('crm-auditoria'),
        labelOverridePt: 'CRM & Auditoria',
        dictKey: 'execCrmAuditoria',
        labelCn: '客户与审计',
        hint: 'RFV, performance de equipe e painel de perdas.',
      },
      {
        id: 'auditoria',
        href: ROUTES.admin.auditoria,
        labelOverridePt: 'Auditoria',
        dictKey: 'auditoria',
        hint: 'Linha do tempo de eventos operacionais.',
      },
      {
        id: 'relatorios-detalhe',
        href: ROUTES.admin.relatorios,
        labelOverridePt: 'Detalhe por domínio',
        dictKey: 'relatoriosDetalhe',
        hint: 'Abas clássicas de detalhe (Produtos, Estoque, Margem, Vendas).',
      },
    ],
  },
  {
    id: 'configuracoes',
    href: ROUTES.admin.configuracoes,
    icon: Settings,
    labelOverridePt: 'Configurações',
    dictKey: 'configuracoes',
    children: [
      {
        id: 'suspensao',
        href: ROUTES.admin.suspensao,
        labelOverridePt: 'Suspensão de vendas',
        dictKey: 'suspensao',
      },
    ],
  },
] as const

/** Ação principal, sempre visível acima da lista. */
export const ADMIN_V2_PDV_ITEM: AdminV2NavDestination = {
  id: 'pdv',
  href: ROUTES.caixa.home,
  icon: Monitor,
  labelOverridePt: 'Abrir PDV',
  dictKey: 'abrirPdv',
  labelCn: '前往收银',
  hint: 'Abrir o terminal de caixa.',
}

/** Ferramentas internas (equipe FastProduct). Visibilidade cosmética — a autorização é da policy. */
export const ADMIN_V2_INTERNO_ITEMS: readonly AdminV2NavItem[] = [
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
] as const

/** Todos os links da sidebar, achatados (destinos + sub-links + PDV + internos). */
export function flattenAdminV2Nav(): AdminV2NavItem[] {
  return [
    ...ADMIN_V2_DESTINATIONS.flatMap((d) => [d, ...(d.children ?? [])]),
    ADMIN_V2_PDV_ITEM,
    ...ADMIN_V2_INTERNO_ITEMS,
  ]
}
