import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/lib/navigation/routes'
import {
  ADMIN_V2_DESTINATIONS,
  ADMIN_V2_INTERNO_ITEMS,
  ADMIN_V2_PDV_ITEM,
  flattenAdminV2Nav,
  type AdminV2NavItem,
} from './adminV2SidebarNav'
import { executiveRelatoriosHref } from './executiveViews'
import {
  OPERATIONAL_HUB_IDS,
  buildOperationalHubTabs,
  type OperationalHubLabelSet,
} from './operationalHubNav'
import { CATALOGO_HUB_TABS } from './catalogoHubNav'
import { buildFinanceiroHub, type FinanceiroHubLabels } from './financeiroHubGroups'
import { ESTOQUE_HUB_TABS } from './estoqueHubNav'

const L: OperationalHubLabelSet = {
  vendasVendas: 'v',
  vendasCaixas: 'c',
  vendasClientes: 'cl',
  comprasPedidos: 'p',
  comprasRecebimento: 'r',
  comprasEtiquetas: 'e',
  comprasFornecedores: 'f',
  lojaDados: 'ld',
  lojaFuncionarios: 'fu',
  lojaCategoriasFinanceiras: 'cf',
  lojaSuspensao: 's',
}
const FIN_LABELS: FinanceiroHubLabels = {
  resumo: 'r', resultado: 'rs', receber: 're', pagar: 'p', contasConciliacao: 'cc', contas: 'c',
  recebiveis: 'rb', conciliacao: 'co', fiscal: 'f', comissoes: 'cm',
}
const FIN_HUB = buildFinanceiroHub({
  pathname: '/admin/financeiro',
  activeTab: 'contas',
  searchParams: new URLSearchParams(),
  labels: FIN_LABELS,
})
const HUB_HREFS: string[] = [
  ...FIN_HUB.primary.map((i) => i.href),
  ...(FIN_HUB.secondary ?? []).map((i) => i.href),
  ...OPERATIONAL_HUB_IDS.flatMap((h) => buildOperationalHubTabs(h, L).map((t) => t.href)),
  ...CATALOGO_HUB_TABS.map((t) => t.href),
  ...ESTOQUE_HUB_TABS.map((t) => t.href),
]

const TODOS: readonly AdminV2NavItem[] = flattenAdminV2Nav()

/** Espelha o filtro de `ExecutiveSidebarNav`: itens `adminOnly` só para perfil ADMIN. */
function itensVisiveis(perfilAdmin: boolean): AdminV2NavItem[] {
  return TODOS.filter((item) => !item.adminOnly || perfilAdmin)
}

function hrefs(itens: readonly AdminV2NavItem[]): string[] {
  return itens.map((i) => i.href)
}

describe('menu admin — sanidade estrutural', () => {
  it('ids e hrefs são únicos (nenhum link duplicado na sidebar)', () => {
    const ids = TODOS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    const h = hrefs(TODOS)
    expect(new Set(h).size).toBe(h.length)
  })

  it('todo item tem rótulo pt resolvível', () => {
    for (const item of TODOS) {
      expect(item.labelOverridePt ?? item.labelPt ?? item.dictKey).toBeTruthy()
    }
  })

  it('sub-links nunca repetem o href do destino pai', () => {
    for (const d of ADMIN_V2_DESTINATIONS) {
      expect(hrefs(d.children ?? [])).not.toContain(d.href)
    }
  })
})

describe('menu admin — 8 destinos pela jornada da loja (2026-10-15)', () => {
  it('segue a jornada: hoje → vender → abastecer → estoque → produtos → dinheiro → análises → loja', () => {
    expect(ADMIN_V2_DESTINATIONS.map((d) => d.id)).toEqual([
      'inicio',
      'vender',
      'abastecer',
      'estoque',
      'produtos',
      'dinheiro',
      'analises',
      'loja',
    ])
  })

  it('gerente vê 8 destinos + Abrir PDV = 9 entradas de primeiro nível', () => {
    const primeiroNivel = [...ADMIN_V2_DESTINATIONS, ADMIN_V2_PDV_ITEM].filter(
      (i) => !i.adminOnly,
    )
    expect(primeiroNivel).toHaveLength(9)
  })

  it('cada rota de hub pertence a um único destino (sem duplicação entre menus)', () => {
    const dono = new Map<string, string>()
    for (const d of ADMIN_V2_DESTINATIONS) {
      for (const p of [d.href.split('?')[0]!, ...(d.alsoActivePaths ?? [])]) {
        expect(dono.get(p), `${p} em ${dono.get(p)} e ${d.id}`).toBeUndefined()
        dono.set(p, d.id)
      }
    }
  })

  it('entradas e etiquetas ficam em Abastecer, não em Estoque', () => {
    const estoque = ADMIN_V2_DESTINATIONS.find((d) => d.id === 'estoque')!
    const abastecer = ADMIN_V2_DESTINATIONS.find((d) => d.id === 'abastecer')!
    for (const p of [ROUTES.admin.estoqueRecebimento, ROUTES.admin.estoqueImprimirEtiquetas, ROUTES.admin.importNfe]) {
      expect(estoque.notActivePaths).toContain(p)
      expect(abastecer.alsoActivePaths).toContain(p)
    }
  })

  it('"Abrir PDV" aponta para o PDV e é visível a todos os perfis do painel', () => {
    expect(ADMIN_V2_PDV_ITEM.href).toBe(ROUTES.caixa.home)
    expect(hrefs(itensVisiveis(false))).toContain(ROUTES.caixa.home)
  })

  it('Análises abre na view Vendas & Caixas e concentra as demais views + Auditoria', () => {
    const rel = ADMIN_V2_DESTINATIONS.find((d) => d.id === 'analises')!
    expect(rel.href).toBe(executiveRelatoriosHref('vendas-caixas'))
    const filhos = hrefs(rel.children ?? [])
    expect(filhos).toContain(executiveRelatoriosHref('dre-financeiro'))
    expect(filhos).toContain(executiveRelatoriosHref('produtos-estoque'))
    expect(filhos).toContain(executiveRelatoriosHref('crm-auditoria'))
    expect(filhos).toContain(ROUTES.admin.auditoria)
    // PR 7: o relatório clássico foi aposentado — nenhum item aponta mais para a rota sem ?view=
    expect(filhos).not.toContain(ROUTES.admin.relatorios)
  })
})

describe('menu admin — alcance: nenhuma rota saiu da sidebar', () => {
  // Rotas que eram alcançáveis pela sidebar antes do PR 1 (auditoria 2026-10-08, seção A).
  const ANTES = [
    ROUTES.admin.dashboard,
    ROUTES.admin.vendas,
    ROUTES.admin.caixas,
    ROUTES.admin.catalogo,
    ROUTES.admin.clientes,
    ROUTES.admin.funcionarios,
    ROUTES.admin.estoque,
    ROUTES.admin.financeiro,
    ROUTES.admin.auditoria,
    ROUTES.admin.fornecedores,
    ROUTES.admin.compras,
    ROUTES.admin.comissoes,
    ROUTES.admin.configuracoes,
    ROUTES.admin.suspensao,
    ROUTES.caixa.home,
    executiveRelatoriosHref('vendas-caixas'),
    executiveRelatoriosHref('dre-financeiro'),
    executiveRelatoriosHref('produtos-estoque'),
    executiveRelatoriosHref('crm-auditoria'),
  ]

  it('todo destino anterior continua alcançável: sidebar do gerente ou barra de abas do hub', () => {
    const alcancaveis = new Set([...hrefs(itensVisiveis(false)), ...HUB_HREFS])
    for (const href of ANTES) {
      expect(alcancaveis.has(href), href).toBe(true)
    }
  })

  it('páginas irmãs com barra de abas não duplicam sub-link na sidebar', () => {
    const naSidebar = new Set(hrefs(itensVisiveis(false)))
    for (const h of OPERATIONAL_HUB_IDS) {
      const [, ...irmas] = buildOperationalHubTabs(h, L)
      for (const t of irmas) expect(naSidebar.has(t.href), t.href).toBe(false)
    }
  })

  it('o ADMIN continua vendo as ferramentas internas', () => {
    const visiveis = hrefs(itensVisiveis(true))
    expect(visiveis).toContain(ROUTES.admin.provisionamento)
    expect(visiveis).toContain(ROUTES.admin.implantacao)
    expect(visiveis).toContain(ROUTES.admin.diagnosticoCaixa)
  })
})

describe('menu admin — hubs mantêm taxonomias fora da sidebar', () => {
  it('categorias, marcas, recebimento, transferências e suspensão não são entradas da sidebar', () => {
    const visiveis = hrefs(itensVisiveis(false))
    expect(visiveis).not.toContain(ROUTES.admin.categoriasProdutos)
    expect(visiveis).not.toContain(ROUTES.admin.marcasProdutos)
    expect(visiveis).not.toContain(ROUTES.admin.estoqueRecebimento)
    expect(visiveis).not.toContain(ROUTES.admin.estoqueTransferencias)
    expect(visiveis).not.toContain(ROUTES.admin.categoriasFinanceiras)
    expect(visiveis).not.toContain(ROUTES.admin.suspensao)
  })
})

describe('menu admin — ferramentas internas fora da visão do cliente', () => {
  const INTERNOS = [
    ROUTES.admin.implantacao,
    ROUTES.admin.diagnosticoCaixa,
    ROUTES.admin.provisionamento,
  ]

  it('DONO/GERENTE não enxergam implantação, diagnóstico nem provisionamento', () => {
    const visiveis = hrefs(itensVisiveis(false))
    for (const href of INTERNOS) {
      expect(visiveis).not.toContain(href)
    }
  })

  it('todo item interno está marcado com adminOnly', () => {
    expect(ADMIN_V2_INTERNO_ITEMS).toHaveLength(INTERNOS.length)
    for (const item of ADMIN_V2_INTERNO_ITEMS) {
      expect(item.adminOnly).toBe(true)
    }
  })
})

describe('menu admin — nomenclatura', () => {
  it('suspensão descreve a função real (vendas), não "licença"', () => {
    const aba = buildOperationalHubTabs('loja', {
      ...L,
      lojaSuspensao: 'Suspensão de vendas',
    }).find((t) => t.href === ROUTES.admin.suspensao)
    expect(aba?.label).toBe('Suspensão de vendas')
    expect(aba?.label).not.toMatch(/licen/i)
  })

  it('"Produtos" no menu coincide com a chave do dicionário (antes: "Catálogo" × 商品)', () => {
    const item = ADMIN_V2_DESTINATIONS.find((d) => d.href === ROUTES.admin.catalogo)
    expect(item?.labelOverridePt).toBe('Produtos')
    expect(item?.dictKey).toBe('produtos')
  })
})
