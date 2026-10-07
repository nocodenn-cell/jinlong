import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/lib/navigation/routes'
import {
  ADMIN_V2_ANALISES_ITEMS,
  ADMIN_V2_CORE_ITEMS,
  ADMIN_V2_OPERACOES_ITEMS,
  ADMIN_V2_SISTEMA_ITEMS,
  type AdminV2NavItem,
} from './adminV2SidebarNav'
import { executiveRelatoriosHref } from './executiveViews'

const TODOS: readonly AdminV2NavItem[] = [
  ...ADMIN_V2_ANALISES_ITEMS,
  ...ADMIN_V2_OPERACOES_ITEMS,
  ...ADMIN_V2_SISTEMA_ITEMS,
]

/** Espelha o filtro de `ExecutiveSidebarNav`: itens `adminOnly` só para perfil ADMIN. */
function itensVisiveis(perfilAdmin: boolean): AdminV2NavItem[] {
  return TODOS.filter((item) => !item.adminOnly || perfilAdmin)
}

function hrefs(itens: readonly AdminV2NavItem[]): string[] {
  return itens.map((i) => i.href)
}

describe('menu admin — sanidade estrutural', () => {
  it('ids são únicos entre os três grupos', () => {
    const ids = TODOS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('todo item tem rótulo pt resolvível sem depender do dicionário', () => {
    for (const item of TODOS) {
      expect(item.labelOverridePt ?? item.labelPt ?? item.dictKey).toBeTruthy()
    }
  })

  it('ANÁLISES tem exatamente 5 abas executivas', () => {
    expect(ADMIN_V2_ANALISES_ITEMS).toHaveLength(5)
    expect(ADMIN_V2_CORE_ITEMS).toBe(ADMIN_V2_ANALISES_ITEMS)
  })
})

describe('menu admin — hubs (Sprint 6 + Fase 1 executiva)', () => {
  it('categorias e marcas de produto não são entradas separadas na sidebar', () => {
    const visiveis = hrefs(itensVisiveis(false))
    expect(visiveis).not.toContain(ROUTES.admin.categoriasProdutos)
    expect(visiveis).not.toContain(ROUTES.admin.marcasProdutos)
    expect(visiveis).toContain(ROUTES.admin.catalogo)
  })

  it('recebimento e transferências não são entradas separadas na sidebar', () => {
    const visiveis = hrefs(itensVisiveis(false))
    expect(visiveis).not.toContain(ROUTES.admin.estoqueRecebimento)
    expect(visiveis).not.toContain(ROUTES.admin.estoqueTransferencias)
    expect(visiveis).toContain(ROUTES.admin.estoque)
  })

  it('categorias financeiras não aparecem em Operações', () => {
    expect(hrefs(ADMIN_V2_OPERACOES_ITEMS)).not.toContain(ROUTES.admin.categoriasFinanceiras)
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

  it('ADMIN continua enxergando as ferramentas internas', () => {
    const visiveis = hrefs(itensVisiveis(true))
    for (const href of INTERNOS) {
      expect(visiveis).toContain(href)
    }
  })

  it('todo item interno está marcado com adminOnly', () => {
    for (const href of INTERNOS) {
      const item = TODOS.find((i) => i.href === href)
      expect(item?.adminOnly).toBe(true)
    }
  })
})

describe('menu admin — nomenclatura', () => {
  it('suspensão descreve a função real (vendas), não "licença"', () => {
    const item = TODOS.find((i) => i.href === ROUTES.admin.suspensao)
    expect(item?.labelOverridePt).toBe('Suspensão de vendas')
    expect(item?.labelOverridePt).not.toMatch(/licen/i)
  })
})

describe('menu admin — IA executiva Fase 1', () => {
  it('Visão Geral aponta para /admin/dashboard', () => {
    expect(hrefs(ADMIN_V2_ANALISES_ITEMS)).toContain(ROUTES.admin.dashboard)
  })

  it('abas 2–5 apontam para /admin/relatorios?view=…', () => {
    expect(hrefs(ADMIN_V2_ANALISES_ITEMS)).toContain(executiveRelatoriosHref('vendas-caixas'))
    expect(hrefs(ADMIN_V2_ANALISES_ITEMS)).toContain(executiveRelatoriosHref('dre-financeiro'))
    expect(hrefs(ADMIN_V2_ANALISES_ITEMS)).toContain(executiveRelatoriosHref('produtos-estoque'))
    expect(hrefs(ADMIN_V2_ANALISES_ITEMS)).toContain(executiveRelatoriosHref('crm-auditoria'))
  })

  it('ERP operacional permanece em Operações (catálogo, estoque, financeiro)', () => {
    const ops = hrefs(ADMIN_V2_OPERACOES_ITEMS)
    expect(ops).toContain(ROUTES.admin.catalogo)
    expect(ops).toContain(ROUTES.admin.estoque)
    expect(ops).toContain(ROUTES.admin.financeiro)
    expect(ops).toContain(ROUTES.admin.vendas)
  })

  it('atalho para o PDV permanece disponível a todos os perfis gerenciais', () => {
    expect(hrefs(itensVisiveis(false))).toContain(ROUTES.caixa.home)
  })
})
