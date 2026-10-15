/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/estoque/imprimir-etiquetas',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('./actions', () => ({
  buscarProdutoPorCodigo: vi.fn(),
  buscarEstoqueAtual: vi.fn(),
  buscarProdutosPorCategoria: vi.fn(),
}))
vi.mock('@/app/gerente/categorias-produtos/actions', () => ({
  listarCategoriasProdutos: vi.fn(),
}))
vi.mock('@/lib/etiqueta/gerarPdf', () => ({ baixarPdfEtiquetas: vi.fn() }))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))
vi.mock('./ProdutoEtiquetaAutocomplete', () => ({
  ProdutoEtiquetaAutocomplete: () => <input aria-label="busca etiqueta" />,
}))

import { ImprimirEtiquetasPageClient } from './ImprimirEtiquetasPageClient'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

it('começa em selecionar produtos e só avança com itens no lote', () => {
  act(() => {
    root.render(<ImprimirEtiquetasPageClient idioma="pt" embeddedInAdminHub />)
  })
  expect(container.textContent).toContain('Selecionar produtos')
  expect(container.textContent).toContain('Passo 1 de 4')
  expect(container.querySelector('[aria-label="busca etiqueta"]')).toBeTruthy()
  const continuar = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Continuar'))
  expect(continuar?.hasAttribute('disabled') || continuar?.getAttribute('aria-disabled') === 'true').toBe(true)
  expect(container.textContent).not.toContain('Pré-visualização')
})
