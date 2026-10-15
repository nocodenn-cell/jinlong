/** @vitest-environment jsdom */
/**
 * Roadmap UX, Tarefa 8 — Catálogo adota o padrão de filtros: as duas barras (principal e
 * avançada) usam o grid responsivo do FilterBar. Estoque e Movimentações também — conferido
 * no fonte das páginas (Server Components async, sem render isolado).
 */
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilterDef } from '@/components/ui/FilterBar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/catalogo',
  useSearchParams: () => new URLSearchParams('marca=x'),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

const { CatalogoFiltrosBar } = await import('./CatalogoFiltrosBar')

const primarios: FilterDef[] = [{ type: 'search', key: 'q', placeholder: 'Buscar' }]
const avancados: FilterDef[] = [
  { type: 'select', key: 'marca', label: 'Marca', defaultValue: '', options: [{ value: '', label: 'Todas' }] },
]

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

describe('Catálogo — filtros em grid', () => {
  it('barra principal e avançada usam layout="grid"', () => {
    flushSync(() => {
      root.render(
        <CatalogoFiltrosBar
          primaryFilters={primarios}
          advancedFilters={avancados}
          advancedActive
          clearLabel="Limpar"
          filtrosAriaLabel="Filtros"
          limparAriaLabel="Limpar filtros"
          maisFiltrosLabel="Mais filtros"
          menosFiltrosLabel="Menos filtros"
        />,
      )
    })
    const barras = Array.from(container.querySelectorAll('section[role="search"]'))
    expect(barras.length).toBe(2) // avançada aberta (filtro avançado ativo)
    for (const barra of barras) expect(barra.getAttribute('data-layout')).toBe('grid')
  })
})

describe('Estoque e Movimentações — filtros em grid', () => {
  const raiz = path.resolve(__dirname, '../..')
  it.each(['estoque/page.tsx', 'estoque/movimentacoes/page.tsx'])('%s usa layout="grid"', (arquivo) => {
    const fonte = fs.readFileSync(path.join(raiz, arquivo), 'utf8')
    const barra = fonte.slice(fonte.indexOf('<FilterBar'), fonte.indexOf('/>', fonte.indexOf('<FilterBar')))
    expect(barra).toContain('layout="grid"')
  })
})
