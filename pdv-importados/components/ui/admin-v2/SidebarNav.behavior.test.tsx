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

  it('mostra Abrir PDV e os 9 destinos principais sem abrir nada', () => {
    const hrefs = renderMenu(false)
    expect(hrefs).toContain(ROUTES.caixa.home)
    for (const href of [
      ROUTES.admin.dashboard,
      ROUTES.admin.vendas,
      ROUTES.admin.catalogo,
      ROUTES.admin.estoque,
      ROUTES.admin.compras,
      ROUTES.admin.financeiro,
      ROUTES.admin.clientes,
      executiveRelatoriosHref('vendas-caixas'),
      ROUTES.admin.configuracoes,
    ]) {
      expect(hrefs).toContain(href)
    }
    // 9 destinos + PDV, sem sub-links (grupo fechado: rota atual é o dashboard)
    expect(hrefs).toHaveLength(10)
  })

  it('sub-links só aparecem com o grupo aberto (rota atual dentro do grupo)', () => {
    expect(renderMenu(false)).not.toContain(ROUTES.admin.comissoes)
    currentPathname = ROUTES.admin.financeiro
    const hrefs = renderMenu(false)
    expect(hrefs).toContain(ROUTES.admin.comissoes)
    expect(container.querySelector('[data-nav-children-of="financeiro"]')).not.toBeNull()
  })

  it('Caixas, Fornecedores e Funcionários não são links da sidebar (vivem na barra de abas)', () => {
    for (const path of [ROUTES.admin.vendas, ROUTES.admin.caixas, ROUTES.admin.compras, ROUTES.admin.clientes]) {
      currentPathname = path
      const hrefs = renderMenu(false)
      expect(hrefs).not.toContain(ROUTES.admin.caixas)
      expect(hrefs).not.toContain(ROUTES.admin.fornecedores)
      expect(hrefs).not.toContain(ROUTES.admin.funcionarios)
    }
  })

  it('em páginas irmãs de um hub, o destino do grupo fica ativo', () => {
    const casos: Array<[string, string]> = [
      [ROUTES.admin.caixas, ROUTES.admin.vendas],
      [ROUTES.admin.fornecedores, ROUTES.admin.compras],
      [ROUTES.admin.funcionarios, ROUTES.admin.clientes],
      [ROUTES.admin.categoriasProdutos, ROUTES.admin.catalogo],
      [ROUTES.admin.marcasProdutos, ROUTES.admin.catalogo],
      [ROUTES.admin.categoriasFinanceiras, ROUTES.admin.financeiro],
      [ROUTES.admin.estoqueRecebimento, ROUTES.admin.estoque],
    ]
    for (const [path, destino] of casos) {
      currentPathname = path
      renderMenu(false)
      const ativo = container.querySelector('[aria-current="page"]')
      expect(ativo?.getAttribute('href'), path).toBe(destino)
    }
  })

  it('Relatórios aberto expõe views, Auditoria e o detalhe clássico', () => {
    currentPathname = ROUTES.admin.relatorios
    currentSearch = 'view=dre-financeiro'
    const hrefs = renderMenu(false)
    expect(hrefs).toContain(executiveRelatoriosHref('dre-financeiro'))
    expect(hrefs).toContain(executiveRelatoriosHref('produtos-estoque'))
    expect(hrefs).toContain(executiveRelatoriosHref('crm-auditoria'))
    expect(hrefs).toContain(ROUTES.admin.auditoria)
    expect(hrefs).toContain(ROUTES.admin.relatorios)
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

  it('rotula a suspensão pela função real, não por "licença"', () => {
    currentPathname = ROUTES.admin.configuracoes
    renderMenu(false)
    const texto = container.textContent ?? ''
    expect(texto).toContain('Suspensão de vendas')
    expect(texto).not.toMatch(/licen/i)
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
    expect(texto).toContain('首页')
    expect(texto).toContain('前往收银')
    expect(texto).not.toMatch(/Análises|Operações|Sistema/)
  })

  it('grupo Interno do ADMIN usa o rótulo traduzido', () => {
    renderMenu(true, true)
    expect(container.textContent ?? '').toContain('内部工具')
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
