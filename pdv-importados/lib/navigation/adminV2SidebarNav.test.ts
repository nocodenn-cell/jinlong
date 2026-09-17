import { describe, expect, it } from 'vitest'
import { ROUTES } from '@shared-core/navigation/routes'
import {
  ADMIN_V2_OPERACAO_ITEMS,
  ADMIN_V2_CADASTROS_ITEMS,
  ADMIN_V2_ANALISE_ITEMS,
  ADMIN_V2_ADMINISTRACAO_ITEMS,
  type AdminV2NavItem,
} from './adminV2SidebarNav'

const TODOS: readonly AdminV2NavItem[] = [
  ...ADMIN_V2_OPERACAO_ITEMS,
  ...ADMIN_V2_CADASTROS_ITEMS,
  ...ADMIN_V2_ANALISE_ITEMS,
  ...ADMIN_V2_ADMINISTRACAO_ITEMS,
]

/** Espelha o filtro de `SidebarNav`: itens `adminOnly` só para perfil ADMIN. */
function itensVisiveis(perfilAdmin: boolean): AdminV2NavItem[] {
  return TODOS.filter((item) => !item.adminOnly || perfilAdmin)
}

function hrefs(itens: readonly AdminV2NavItem[]): string[] {
  return itens.map((i) => i.href)
}

describe('menu admin — sanidade estrutural', () => {
  it('ids são únicos entre os quatro grupos', () => {
    const ids = TODOS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('todo item tem rótulo pt resolvível sem depender do dicionário', () => {
    for (const item of TODOS) {
      expect(item.labelOverridePt ?? item.labelPt ?? item.dictKey).toBeTruthy()
    }
  })

  it('Operação tem no máximo 10 itens (Sprint 6 — redução de carga cognitiva)', () => {
    expect(ADMIN_V2_OPERACAO_ITEMS.length).toBeLessThanOrEqual(10)
  })
})

describe('menu admin — hubs (Sprint 6)', () => {
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

  it('categorias financeiras não aparecem como entrada separada em Cadastros', () => {
    expect(hrefs(ADMIN_V2_CADASTROS_ITEMS)).not.toContain(ROUTES.admin.categoriasFinanceiras)
  })
})

describe('menu admin — implantação e diagnóstico do caixa nunca aparecem na navegação', () => {
  const OCULTOS = [ROUTES.admin.implantacao, ROUTES.admin.diagnosticoCaixa]

  it('não existem como item de menu para nenhum perfil (nem DONO/GERENTE, nem ADMIN)', () => {
    for (const href of OCULTOS) {
      expect(hrefs(itensVisiveis(false))).not.toContain(href)
      expect(hrefs(itensVisiveis(true))).not.toContain(href)
      expect(hrefs(TODOS)).not.toContain(href)
    }
  })
})

describe('menu admin — ferramentas internas fora da visão do cliente', () => {
  const INTERNOS = [ROUTES.admin.provisionamento]

  it('DONO/GERENTE não enxergam provisionamento', () => {
    const visiveis = hrefs(itensVisiveis(false))
    for (const href of INTERNOS) {
      expect(visiveis).not.toContain(href)
    }
  })

  it('ADMIN continua enxergando provisionamento', () => {
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
  it('relatórios permanecem visíveis em Análise', () => {
    expect(hrefs(ADMIN_V2_ANALISE_ITEMS)).toContain(ROUTES.admin.relatorios)
  })

  it('atalho para o PDV permanece disponível a todos os perfis gerenciais', () => {
    expect(hrefs(itensVisiveis(false))).toContain(ROUTES.caixa.home)
  })
})
