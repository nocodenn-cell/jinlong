import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  Ship,
  ClipboardCheck,
  FileBarChart2,
  LayoutDashboard,
  Monitor,
  Package,
  Rocket,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  Truck,
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
  /** Rotas irmãs (abas do hub) que também marcam este item como ativo. */
  alsoActivePaths?: readonly string[]
  /** Sub-rotas sob o `href` que pertencem a OUTRO destino (não marcam este como ativo). */
  notActivePaths?: readonly string[]
  /** Módulo opcional: o item só aparece quando a empresa do usuário tem a licença ativa. */
  modulo?: 'IMPORT_INTELLIGENCE'
}

/**
 * Destino principal da sidebar. `href` é a página padrão do grupo. Páginas irmãs ficam em
 * barra de abas dentro da página (hubs: ver `operationalHubNav.ts`, `catalogoHubNav.ts`, ...);
 * `children` só existe onde NÃO há barra de abas (Análises) e nunca repete o `href` do pai.
 * Só aparecem com o grupo aberto. Rotas e permissões não mudam (UX-IA-01).
 */
export type AdminV2NavDestination = AdminV2NavItem & {
  icon: LucideIcon
  children?: readonly AdminV2NavItem[]
}

/**
 * Navegação principal — organizada pela jornada da loja (IA por jornada, 2026-10-15):
 * comprar → receber → etiquetar → vender → receber o dinheiro → analisar.
 * Cada rota pertence a UM destino; páginas irmãs ficam na barra de abas do hub.
 */
export const ADMIN_V2_DESTINATIONS: readonly AdminV2NavDestination[] = [
  {
    id: 'inicio',
    href: ROUTES.admin.dashboard,
    icon: LayoutDashboard,
    labelOverridePt: 'Hoje',
    dictKey: 'hoje',
    hint: 'Pendências e alertas do dia.',
  },
  {
    id: 'vender',
    href: ROUTES.admin.vendas,
    icon: ShoppingCart,
    labelOverridePt: 'Vender',
    dictKey: 'vender',
    alsoActivePaths: [ROUTES.admin.caixas, ROUTES.admin.clientes, ROUTES.admin.revisaoOffline],
    hint: 'Vendas, caixas, clientes e revisão offline (abas na página).',
  },
  {
    id: 'abastecer',
    href: ROUTES.admin.compras,
    icon: Truck,
    labelOverridePt: 'Abastecer',
    dictKey: 'abastecer',
    alsoActivePaths: [
      ROUTES.admin.fornecedores,
      ROUTES.admin.estoqueRecebimento,
      ROUTES.admin.importNfe,
      ROUTES.admin.estoqueImprimirEtiquetas,
    ],
    hint: 'Pedido de compra → recebimento → etiquetas, e fornecedores (abas na página).',
  },
  {
    id: 'estoque',
    href: ROUTES.admin.estoque,
    icon: Package,
    labelOverridePt: 'Estoque',
    dictKey: 'estoque',
    // Entradas e etiquetas vivem sob /admin/estoque/* mas pertencem a Abastecer.
    notActivePaths: [
      ROUTES.admin.estoqueRecebimento,
      ROUTES.admin.importNfe,
      ROUTES.admin.estoqueImprimirEtiquetas,
    ],
    hint: 'Saldos, movimentações e transferências (abas na página).',
  },
  {
    id: 'produtos',
    href: ROUTES.admin.catalogo,
    icon: Tag,
    labelOverridePt: 'Produtos',
    dictKey: 'produtos',
    alsoActivePaths: [ROUTES.admin.categoriasProdutos, ROUTES.admin.marcasProdutos],
    hint: 'Produtos, categorias e marcas (abas na página).',
  },
  {
    id: 'dinheiro',
    href: ROUTES.admin.financeiro,
    icon: Banknote,
    labelOverridePt: 'Dinheiro',
    dictKey: 'dinheiro',
    alsoActivePaths: [ROUTES.admin.comissoes],
    hint: 'A receber, a pagar, contas e conciliação, fiscal e comissões (abas na página).',
  },
  {
    id: 'analises',
    href: executiveRelatoriosHref('vendas-caixas'),
    icon: FileBarChart2,
    labelOverridePt: 'Análises',
    dictKey: 'analises',
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
    ],
  },
  {
    id: 'loja',
    href: ROUTES.admin.configuracoes,
    icon: Settings,
    labelOverridePt: 'Loja e equipe',
    dictKey: 'lojaEquipe',
    alsoActivePaths: [
      ROUTES.admin.funcionarios,
      ROUTES.admin.categoriasFinanceiras,
      ROUTES.admin.suspensao,
      ROUTES.admin.assinatura,
    ],
    hint: 'Dados da loja, funcionários, categorias financeiras, suspensão de vendas e assinatura (abas na página).',
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

/**
 * Módulos contratados por cliente. Ficam FORA dos 9 destinos e de `flattenAdminV2Nav`
 * (paleta de comandos): só aparecem quando o servidor confirma a licença
 * (`modulosAtivos`). Visibilidade é cosmética — página e actions revalidam no servidor.
 */
export const ADMIN_V2_MODULO_ITEMS: readonly AdminV2NavItem[] = [
  {
    id: 'importacoes',
    href: ROUTES.admin.importacoes,
    icon: Ship,
    labelOverridePt: 'Importações',
    labelCn: '进口管理',
    hint: 'Custo de importação (landed cost): cadastro, apuração e aprovação.',
    modulo: 'IMPORT_INTELLIGENCE',
  },
] as const

export function modulosVisiveis(modulosAtivos: readonly string[] | undefined): AdminV2NavItem[] {
  const ativos = new Set(modulosAtivos ?? [])
  return ADMIN_V2_MODULO_ITEMS.filter((item) => item.modulo !== undefined && ativos.has(item.modulo))
}

/** Todos os links da sidebar, achatados (destinos + sub-links + PDV + internos). */
export function flattenAdminV2Nav(): AdminV2NavItem[] {
  return [
    ...ADMIN_V2_DESTINATIONS.flatMap((d) => [d, ...(d.children ?? [])]),
    ADMIN_V2_PDV_ITEM,
    ...ADMIN_V2_INTERNO_ITEMS,
  ]
}
