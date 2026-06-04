/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataTablePage } from '@/components/gerente/DataTablePage'

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

function render(ui: React.ReactElement) {
  flushSync(() => root.render(ui))
}

describe('DataTablePage', () => {
  it('renderiza children (corpo) e slots passados', () => {
    render(
      <DataTablePage
        filters={<span data-testid="f">filtros</span>}
        actions={<button>Novo</button>}
        meta="42 itens"
        kpis={<div data-testid="kpis">kpis</div>}
        pagination={<nav data-testid="pag">paginação</nav>}
      >
        <table data-testid="corpo" />
      </DataTablePage>,
    )
    expect(container.querySelector('[data-testid="corpo"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="f"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="kpis"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="pag"]')).not.toBeNull()
    expect(container.textContent).toContain('Novo')
    expect(container.textContent).toContain('42 itens')
  })

  it('bulkBar só aparece quando passado', () => {
    render(
      <DataTablePage>
        <table />
      </DataTablePage>,
    )
    expect(container.querySelector('.border-amber-400\\/40')).toBeNull()

    render(
      <DataTablePage bulkBar={<button>Excluir selecionados</button>}>
        <table />
      </DataTablePage>,
    )
    expect(container.textContent).toContain('Excluir selecionados')
  })
})
