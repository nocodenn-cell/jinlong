/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GerenteTable, type GerenteTableColumn } from '@/components/gerente/GerenteTable'

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

const columns: GerenteTableColumn[] = [
  { key: 'nome', header: 'Nome', priority: 'primary' },
  { key: 'doc', header: 'Doc' },
  { key: 'valor', header: 'Valor', numeric: true },
]

function render(ui: React.ReactElement) {
  flushSync(() => root.render(ui))
}

describe('GerenteTable loading (#28 skeleton)', () => {
  it('loading=true renderiza N linhas-fantasma com .jl-shimmer e ignora children', () => {
    render(
      <GerenteTable columns={columns} loading skeletonRows={4}>
        <tr data-testid="real-row"><td>x</td></tr>
      </GerenteTable>,
    )
    const bodyRows = container.querySelectorAll('tbody tr')
    expect(bodyRows.length).toBe(4)
    // cada linha tem uma célula shimmer por coluna
    expect(container.querySelectorAll('tbody .jl-shimmer').length).toBe(4 * columns.length)
    // a row real não é renderizada durante o loading
    expect(container.querySelector('[data-testid="real-row"]')).toBeNull()
    // colunas numéricas ganham ml-auto (alinhamento à direita)
    expect(container.querySelector('tbody .jl-shimmer.ml-auto')).not.toBeNull()
  })

  it('loading=false renderiza os children reais', () => {
    render(
      <GerenteTable columns={columns} loading={false}>
        <tr data-testid="real-row"><td>conteúdo</td></tr>
      </GerenteTable>,
    )
    expect(container.querySelector('[data-testid="real-row"]')).not.toBeNull()
    expect(container.querySelector('.jl-shimmer')).toBeNull()
  })
})
