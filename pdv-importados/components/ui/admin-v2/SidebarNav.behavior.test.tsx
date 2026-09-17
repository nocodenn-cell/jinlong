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

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/dashboard',
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
const { ROUTES } = await import('@shared-core/navigation/routes')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

/** Renderiza o menu e devolve os hrefs realmente presentes no DOM. */
function renderMenu(perfilAdmin: boolean): string[] {
  const admin = getMessages('pt').admin
  flushSync(() => {
    root.render(
      React.createElement(SidebarNav, {
        admin,
        chineseLanguage: false,
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

  it('alcança catálogo e estoque em Cadastros/Operação (taxonomias via hub, não sidebar)', () => {
    const hrefs = renderMenu(false)
    expect(hrefs).toContain(ROUTES.admin.catalogo)
    expect(hrefs).not.toContain(ROUTES.admin.categoriasProdutos)
    expect(hrefs).not.toContain(ROUTES.admin.marcasProdutos)
    expect(hrefs).toContain(ROUTES.admin.estoque)
    expect(hrefs).not.toContain(ROUTES.admin.estoqueRecebimento)
  })

  it('categorias financeiras não aparecem como entrada separada (aba do hub financeiro)', () => {
    expect(renderMenu(false)).not.toContain(ROUTES.admin.categoriasFinanceiras)
  })

  it('vê relatórios sempre visíveis, sem precisar abrir nenhuma gaveta', () => {
    const hrefs = renderMenu(false)
    expect(hrefs).toContain(ROUTES.admin.relatorios)
  })

  it('rotula a suspensão pela função real, não por "licença"', () => {
    renderMenu(false)
    const texto = container.textContent ?? ''
    expect(texto).toContain('Suspensão de vendas')
    expect(texto).not.toMatch(/licen/i)
  })
})

describe('SidebarNav — perfil ADMIN (equipe FastProduct)', () => {
  it('mantém acesso a provisionamento, mas não a implantação nem diagnóstico do caixa', () => {
    const hrefs = renderMenu(true)
    expect(hrefs).toContain(ROUTES.admin.provisionamento)
    expect(hrefs).not.toContain(ROUTES.admin.implantacao)
    expect(hrefs).not.toContain(ROUTES.admin.diagnosticoCaixa)
  })

  it('enxerga exatamente 1 item a mais que DONO/GERENTE (provisionamento)', () => {
    expect(renderMenu(true).length - renderMenu(false).length).toBe(1)
  })
})
