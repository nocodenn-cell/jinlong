/** @vitest-environment jsdom */
/**
 * Regressão A2.2 (Sprint UX Onda 1): o botão "Limpar busca" comitava o filtro
 * vazio na URL, mas `flush()` nunca chamava `setValue()` — o campo continuava
 * mostrando o termo antigo mesmo depois da navegação refletir o filtro limpo.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mockSearchParams = new URLSearchParams('q=camisa')
const replaceSpy = vi.fn()
const pushSpy = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/catalogo',
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({
    replace: replaceSpy,
    push: pushSpy,
  }),
}))

const { FilterBar } = await import('@/components/ui/FilterBar')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  mockSearchParams = new URLSearchParams('q=camisa')
  replaceSpy.mockClear()
  pushSpy.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function renderBar() {
  flushSync(() => {
    root.render(<FilterBar filters={[{ type: 'search', key: 'q', placeholder: 'Buscar…' }]} />)
  })
}

describe('FilterBar — botão Limpar busca (regressão A2.2)', () => {
  it('esvazia visualmente o campo depois que a navegação reflete o filtro limpo', () => {
    renderBar()
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('camisa')

    const clear = container.querySelector(
      'button[aria-label="Limpar busca"]',
    ) as HTMLButtonElement
    flushSync(() => {
      clear.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(replaceSpy).toHaveBeenCalledWith('/admin/catalogo', { scroll: false })

    // Simula o Next.js re-renderizando a página após a navegação resolver,
    // já com a URL sem `q` — é o instante exato em que o bug se manifestava.
    mockSearchParams = new URLSearchParams('')
    renderBar()

    const inputAfter = container.querySelector('input') as HTMLInputElement
    expect(inputAfter.value).toBe('')
  })

  it('o Limpar remove a busca, as chaves extras e a página', () => {
    mockSearchParams = new URLSearchParams('q=camisa&categoria=abc&page=2')
    flushSync(() => {
      root.render(
        <FilterBar
          filters={[{ type: 'search', key: 'q', placeholder: 'Buscar…' }]}
          extraClearKeys={['categoria', 'marca', 'estoque']}
          resetPageOnChange
          clearLabel="Limpar filtros"
        />,
      )
    })

    const clear = container.querySelector(
      'button[aria-label="Limpar todos os filtros"]',
    ) as HTMLButtonElement
    flushSync(() => {
      clear.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(pushSpy).toHaveBeenCalledWith('/admin/catalogo', { scroll: false })
  })
})
