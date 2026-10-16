/** @vitest-environment jsdom */
/**
 * Validação do menu por perfil — o que DONO/GERENTE enxergam versus ADMIN.
 *
 * OPERADOR não aparece aqui de propósito: `isPerfilPainelGerencial` não o inclui,
 * então o middleware redireciona `/admin/*` → `/caixa` e este shell nunca é montado
 * (ver `lib/auth/painelGerencial.ts` e `adminPolicy.middlewareAdminDecision`).
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let currentPathname = '/admin/dashboard'
let currentSearch = ''

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useSearchParams: () => new URLSearchParams(currentSearch),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

const { SidebarNav } = await import('@/components/ui/admin-v2/SidebarNav')
const { getMessages } = await import('@/i18n/getMessages')
const { ROUTES } = await import('@/lib/navigation/routes')
const { executiveRelatoriosHref } = await import('@/lib/navigation/executiveViews')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  currentPathname = '/admin/dashboard'
  currentSearch = ''
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

/** Renderiza o menu e devolve os hrefs realmente presentes no DOM. */
function renderMenu(perfilAdmin: boolean, chinese = false): string[] {
  const admin = getMessages(chinese ? 'zh' : 'pt').admin
  flushSync(() => {
    root.render(
      React.createElement(SidebarNav, {
        admin,
        chineseLanguage: chinese,
        showAdminOnlyItems: perfilAdmin,
      }),
    )
  })
  return Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '')
}

describe('SidebarNav — perfil DONO/GERENTE (cliente)', () => {
  it('não expõe nenhuma ferramenta interna de implantação/diagnóstico', () => {
    const hrefs = renderMenu(false)
    expect(hrefs).not.toContain(ROUTES.admin.implantacao)
    expect(hrefs).not.toContain(ROUTES.admin.diagnosticoCaixa)
    expect(hrefs).not.toContain(ROUTES.admin.provisionamento)
  })

  it('mostra Abrir PDV e os 8 destinos da jornada, na ordem, sem abrir nada', () => {
    const hrefs = renderMenu(false)
    expect(hrefs).toEqual([
      ROUTES.caixa.home,
      ROUTES.admin.dashboard,
      ROUTES.admin.vendas,
      ROUTES.admin.compras,
      ROUTES.admin.estoque,
      ROUTES.admin.catalogo,
      ROUTES.admin.financeiro,
      executiveRelatoriosHref('vendas-caixas'),
      ROUTES.admin.configuracoes,
    ])
    const texto = container.textContent ?? ''
    for (const rotulo of ['Hoje', 'Vender', 'Abastecer', 'Estoque', 'Produtos', 'Dinheiro', 'Análises', 'Loja e equipe']) {
      expect(texto).toContain(rotulo)
    }
  })

  it('sub-links só aparecem com o grupo aberto (rota atual dentro do grupo)', () => {
    expect(renderMenu(false)).not.toContain(ROUTES.admin.auditoria)
    currentPathname = ROUTES.admin.auditoria
    const hrefs = renderMenu(false)
    expect(hrefs).toContain(ROUTES.admin.auditoria)
    expect(container.querySelector('[data-nav-children-of="analises"]')).not.toBeNull()
  })

  it('Comissões é aba do Financeiro: não é link da sidebar, e o destino Financeiro fica ativo nela', () => {
    currentPathname = ROUTES.admin.comissoes
    const hrefs = renderMenu(false)
    expect(hrefs).not.toContain(ROUTES.admin.comissoes)
    expect(container.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe(ROUTES.admin.financeiro)
  })

  it('Caixas, Clientes, Fornecedores e Funcionários não são links da sidebar (vivem na barra de abas)', () => {
    for (const path of [ROUTES.admin.vendas, ROUTES.admin.caixas, ROUTES.admin.compras, ROUTES.admin.clientes]) {
      currentPathname = path
      const hrefs = renderMenu(false)
      expect(hrefs).not.toContain(ROUTES.admin.caixas)
      expect(hrefs).not.toContain(ROUTES.admin.clientes)
      expect(hrefs).not.toContain(ROUTES.admin.fornecedores)
      expect(hrefs).not.toContain(ROUTES.admin.funcionarios)
    }
  })

  it('em páginas irmãs de um hub, o destino do grupo fica ativo', () => {
    const casos: Array<[string, string]> = [
      [ROUTES.admin.caixas, ROUTES.admin.vendas],
      [ROUTES.admin.clientes, ROUTES.admin.vendas],
      [ROUTES.admin.fornecedores, ROUTES.admin.compras],
      [ROUTES.admin.estoqueRecebimento, ROUTES.admin.compras],
      [ROUTES.admin.importNfe, ROUTES.admin.compras],
      [ROUTES.admin.estoqueImprimirEtiquetas, ROUTES.admin.compras],
      [ROUTES.admin.estoqueMovimentacoes, ROUTES.admin.estoque],
      [ROUTES.admin.estoqueTransferencias, ROUTES.admin.estoque],
      [ROUTES.admin.categoriasProdutos, ROUTES.admin.catalogo],
      [ROUTES.admin.marcasProdutos, ROUTES.admin.catalogo],
      [ROUTES.admin.funcionarios, ROUTES.admin.configuracoes],
      [ROUTES.admin.categoriasFinanceiras, ROUTES.admin.configuracoes],
      [ROUTES.admin.suspensao, ROUTES.admin.configuracoes],
    ]
    for (const [path, destino] of casos) {
      currentPathname = path
      renderMenu(false)
      const ativos = Array.from(container.querySelectorAll('[aria-current="page"]'))
      // Exatamente UM destino ativo: entradas/etiquetas não acendem Abastecer E Estoque juntos.
      expect(ativos.map((a) => a.getAttribute('href')), path).toEqual([destino])
    }
  })

  it('Relatórios aberto expõe as views e Auditoria (sem o detalhe clássico)', () => {
    currentPathname = ROUTES.admin.relatorios
    currentSearch = 'view=dre-financeiro'
    const hrefs = renderMenu(false)
    expect(hrefs).toContain(executiveRelatoriosHref('dre-financeiro'))
    expect(hrefs).toContain(executiveRelatoriosHref('produtos-estoque'))
    expect(hrefs).toContain(executiveRelatoriosHref('crm-auditoria'))
    expect(hrefs).toContain(ROUTES.admin.auditoria)
    expect(hrefs).not.toContain(ROUTES.admin.relatorios)
  })

  it('catálogo e estoque entram pelo hub, não por taxonomias soltas', () => {
    const hrefs = renderMenu(false)
    expect(hrefs).toContain(ROUTES.admin.catalogo)
    expect(hrefs).not.toContain(ROUTES.admin.categoriasProdutos)
    expect(hrefs).not.toContain(ROUTES.admin.marcasProdutos)
    expect(hrefs).toContain(ROUTES.admin.estoque)
    expect(hrefs).not.toContain(ROUTES.admin.estoqueRecebimento)
    expect(hrefs).not.toContain(ROUTES.admin.categoriasFinanceiras)
  })

  it('nenhum rótulo fala em "licença"', () => {
    currentPathname = ROUTES.admin.suspensao
    renderMenu(false)
    expect(container.textContent ?? '').not.toMatch(/licen/i)
  })

  it('não mostra o grupo Interno ao gerente', () => {
    renderMenu(false)
    expect(container.querySelector('[data-nav-group="interno"]')).toBeNull()
  })
})

describe('SidebarNav — idioma chinês', () => {
  it('rótulos principais saem em chinês, sem os nomes de grupo antigos em português', () => {
    renderMenu(false, true)
    const texto = container.textContent ?? ''
    for (const cn of ['今日', '销售', '补货', '库存', '商品', '资金', '分析', '店铺与团队', '前往收银']) {
      expect(texto).toContain(cn)
    }
    expect(texto).not.toMatch(/Operações|Sistema/)
  })

  it('grupo Interno do ADMIN usa o rótulo traduzido', () => {
    renderMenu(true, true)
    expect(container.textContent ?? '').toContain('内部工具')
  })
})

describe('SidebarNav — dicas (title) no idioma da interface', () => {
  it('em chinês, a dica de cada item sai em chinês (não em português)', () => {
    renderMenu(false, true)
    const titulos = Array.from(container.querySelectorAll('a[data-nav-id]')).map((a) => a.getAttribute('title') ?? '')
    const comPortugues = titulos.filter((t) => /\b(Vendas|Produtos|Estoque|Compras|Pedido|Dados da loja|abas na página)\b/.test(t.split(' — ')[1] ?? ''))
    expect(comPortugues).toEqual([])
  })

  it('em português, a dica é a descrição atual do item', () => {
    renderMenu(false)
    const rel = container.querySelector('a[data-nav-id="analises"]')
    expect(rel?.getAttribute('title')).toContain('Vendas, resultado, produtos, clientes e auditoria.')
  })
})

describe('SidebarNav — perfil ADMIN (equipe FastProduct)', () => {
  it('mantém acesso às três ferramentas internas, no grupo Interno', () => {
    const hrefs = renderMenu(true)
    expect(hrefs).toContain(ROUTES.admin.implantacao)
    expect(hrefs).toContain(ROUTES.admin.diagnosticoCaixa)
    expect(hrefs).toContain(ROUTES.admin.provisionamento)
    expect(container.querySelector('[data-nav-group="interno"]')).not.toBeNull()
  })

  it('enxerga exatamente 3 itens a mais que DONO/GERENTE', () => {
    expect(renderMenu(true).length - renderMenu(false).length).toBe(3)
  })
})
