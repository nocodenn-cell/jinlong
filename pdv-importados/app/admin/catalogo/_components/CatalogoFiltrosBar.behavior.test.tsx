/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilterDef } from '@/components/ui/FilterBar'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const routerPushMock = vi.fn()
const { getMockSearchParams, setMockSearchParams } = vi.hoisted(() => {
  let value = ''
  return {
    getMockSearchParams: () => value,
    setMockSearchParams: (next: string) => {
      value = next
    },
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
  usePathname: () => '/admin/catalogo',
  useSearchParams: () => new URLSearchParams(getMockSearchParams()),
}))

import { CatalogoFiltrosBar } from '@/app/admin/catalogo/_components/CatalogoFiltrosBar'

const primary: FilterDef[] = [
  { type: 'search', key: 'q', placeholder: 'Buscar' },
  {
    type: 'pills',
    key: 'status',
    label: 'Status',
    defaultValue: 'todos',
    options: [
      { value: 'todos', label: 'Todos' },
      { value: 'ativos', label: 'Ativos' },
    ],
  },
]

const advanced: FilterDef[] = [
  {
    type: 'select',
    key: 'categoria',
    label: 'Categoria',
    defaultValue: '',
    options: [
      { value: '', label: 'Todas' },
      { value: 'cat-1', label: 'Eletrônicos' },
    ],
  },
  {
    type: 'select',
    key: 'estoque',
    label: 'Estoque',
    defaultValue: 'todos',
    options: [
      { value: 'todos', label: 'Qualquer' },
      { value: 'em_falta', label: 'Em falta' },
    ],
  },
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  routerPushMock.mockReset()
  setMockSearchParams('')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('CatalogoFiltrosBar', () => {
  it('Limpar remove filtros primary + advanced + page', () => {
    setMockSearchParams('q=usb&status=ativos&categoria=cat-1&estoque=em_falta&page=3')
    act(() => {
      root.render(
        <CatalogoFiltrosBar
          primaryFilters={primary}
          advancedFilters={advanced}
          advancedActive
          maisFiltrosLabel="Mais filtros"
          menosFiltrosLabel="Menos filtros"
          clearLabel="Limpar filtros"
        />,
      )
    })

    const limpar = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Limpar filtros'),
    ) as HTMLButtonElement
    expect(limpar).toBeTruthy()

    act(() => {
      limpar.click()
    })

    expect(routerPushMock).toHaveBeenCalledTimes(1)
    const href = routerPushMock.mock.calls[0][0] as string
    expect(href).toBe('/admin/catalogo')
  })

  it('com só filtro avançado ainda mostra Limpar', () => {
    setMockSearchParams('categoria=cat-1')
    act(() => {
      root.render(
        <CatalogoFiltrosBar
          primaryFilters={primary}
          advancedFilters={advanced}
          advancedActive
          maisFiltrosLabel="Mais filtros"
          menosFiltrosLabel="Menos filtros"
          clearLabel="Limpar filtros"
        />,
      )
    })

    const limpar = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Limpar filtros'),
    )
    expect(limpar).toBeTruthy()
  })
})
