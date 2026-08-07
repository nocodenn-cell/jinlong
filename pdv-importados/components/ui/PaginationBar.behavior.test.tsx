/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PaginationBar, pageWindow } from '@/components/ui/PaginationBar'

/**
 * PaginationBar substituiu três cópias locais que divergiam em comportamento.
 * Estes testes travam o que precisa ser igual entre as telas — e o que
 * legitimamente difere entre os modos `numbered` e `cursor`.
 */

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

function render(node: React.ReactElement) {
  flushSync(() => root.render(node))
  return container
}

const base = {
  pageHref: (p: number) => `/lista?page=${p}`,
  anteriorLabel: 'Anterior',
  proximaLabel: 'Próxima',
}

describe('PaginationBar — modo numerado', () => {
  it('não renderiza quando há uma página só (barra sem função)', () => {
    const el = render(<PaginationBar {...base} page={1} totalPages={1} />)
    expect(el.textContent).toBe('')
  })

  it('desabilita Anterior na primeira e Próxima na última', () => {
    const primeira = render(<PaginationBar {...base} page={1} totalPages={5} />)
    expect(primeira.querySelector('[aria-disabled="true"]')?.textContent).toBe('Anterior')

    const ultima = render(<PaginationBar {...base} page={5} totalPages={5} />)
    expect(ultima.querySelector('[aria-disabled="true"]')?.textContent).toBe('Próxima')
  })

  it('marca a página atual com aria-current para leitor de tela', () => {
    const el = render(<PaginationBar {...base} page={3} totalPages={9} />)
    expect(el.querySelector('[aria-current="page"]')?.textContent).toBe('3')
  })

  it('preserva os filtros da tela via pageHref', () => {
    const el = render(
      <PaginationBar
        {...base}
        pageHref={(p) => `/lista?q=fone&page=${p}`}
        page={2}
        totalPages={4}
      />,
    )
    const hrefs = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs.every((h) => h?.includes('q=fone'))).toBe(true)
  })
})

describe('PaginationBar — modo cursor', () => {
  it('não mostra números de página (a fonte não sabe o total)', () => {
    const el = render(<PaginationBar {...base} mode="cursor" page={2} hasMore />)
    expect(el.querySelector('[aria-current="page"]')).toBeNull()
    expect(el.textContent).toContain('Anterior')
    expect(el.textContent).toContain('Próxima')
  })

  it('Próxima segue hasMore, não uma contagem total', () => {
    const comMais = render(<PaginationBar {...base} mode="cursor" page={2} hasMore />)
    expect(comMais.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0)

    const semMais = render(<PaginationBar {...base} mode="cursor" page={2} hasMore={false} />)
    expect(semMais.querySelector('[aria-disabled="true"]')?.textContent).toBe('Próxima')
  })

  it('primeira página sem próxima não renderiza nada', () => {
    const el = render(<PaginationBar {...base} mode="cursor" page={1} hasMore={false} />)
    expect(el.textContent).toBe('')
  })
})

describe('pageWindow', () => {
  it('sem elipse quando todas as páginas cabem', () => {
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4])
  })

  it('insere elipse nos dois lados quando a atual está no meio', () => {
    expect(pageWindow(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20])
  })

  it('nunca produz página fora do intervalo', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3])
    expect(pageWindow(3, 3)).toEqual([1, 2, 3])
  })
})
