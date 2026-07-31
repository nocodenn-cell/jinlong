import { describe, expect, it } from 'vitest'
import { ROUTES } from '@shared-core/navigation/routes'
import {
  ADMIN_V2_CORE_ITEMS,
  ADMIN_V2_EXPANDED_ITEMS,
  ADMIN_V2_SISTEMA_ITEMS,
  type AdminV2NavItem,
} from './adminV2SidebarNav'

const TODOS: readonly AdminV2NavItem[] = [
  ...ADMIN_V2_CORE_ITEMS,
  ...ADMIN_V2_EXPANDED_ITEMS,
  ...ADMIN_V2_SISTEMA_ITEMS,
]

/** Espelha o filtro de `SidebarNav`: itens `adminOnly` só para perfil ADMIN. */
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
})

describe('menu admin — cadastros de apoio alcançáveis (fluxo de categorias)', () => {
  it('categorias de produtos está no menu para qualquer perfil gerencial', () => {
    const visiveis = hrefs(itensVisiveis(false))
    expect(visiveis).toContain(ROUTES.admin.categoriasProdutos)
  })

  it('categorias financeiras está no menu para qualquer perfil gerencial', () => {
    const visiveis = hrefs(itensVisiveis(false))
    expect(visiveis).toContain(ROUTES.admin.categoriasFinanceiras)
  })

  it('categorias de produtos acompanha o Catálogo no grupo CORE', () => {
    expect(hrefs(ADMIN_V2_CORE_ITEMS)).toContain(ROUTES.admin.categoriasProdutos)
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

describe('menu admin — tarefas diárias não ficam escondidas', () => {
  it('recebimento e relatórios estão no CORE, não atrás de "Mais"', () => {
    const core = hrefs(ADMIN_V2_CORE_ITEMS)
    expect(core).toContain(ROUTES.admin.estoqueRecebimento)
    expect(core).toContain(ROUTES.admin.relatorios)
    const expandido = hrefs(ADMIN_V2_EXPANDED_ITEMS)
    expect(expandido).not.toContain(ROUTES.admin.estoqueRecebimento)
    expect(expandido).not.toContain(ROUTES.admin.relatorios)
  })

  it('atalho para o PDV permanece disponível a todos os perfis gerenciais', () => {
    expect(hrefs(itensVisiveis(false))).toContain(ROUTES.caixa.home)
  })
})
