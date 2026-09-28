/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ContaLinha, ContasLabels } from './ContasReceberTable'

const { ContasReceberTable } = await import('./ContasReceberTable')

const labels: ContasLabels = {
  colCliente: 'Cliente',
  colVencimento: 'Vencimento',
  colTotal: 'Total',
  colPago: 'Pago',
  colAberto: 'Em aberto',
  colStatus: 'Status',
  statusAberto: 'Aberto',
  statusParcial: 'Parcial',
  statusQuitado: 'Quitado',
  vazioTitulo: 'Sem títulos',
  vazioSub: 'Nada por aqui.',
  verVenda: 'Ver venda',
  locale: 'pt-BR',
}

function conta(overrides: Partial<ContaLinha> = {}): ContaLinha {
  return {
    id: 't1',
    cliente_nome: 'Maria',
    valor_total: 50,
    valor_aberto: 50,
    valor_pago: 0,
    status: 'ABERTO',
    vencimento: null,
    descricao: null,
    loja_id: 'l1',
    venda_id: null,
    ...overrides,
  }
}

describe('ContasReceberTable (RM-07 — link de volta para a venda de origem)', () => {
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

  it('mostra o link "Ver venda" quando o título tem venda_id', () => {
    flushSync(() => {
      root.render(
        <ContasReceberTable contas={[conta({ venda_id: 'venda-99' })]} labels={labels} />,
      )
    })
    const link = container.querySelector('a[href="/admin/vendas?venda=venda-99"]')
    expect(link?.textContent).toContain('Ver venda')
  })

  it('não mostra o link quando o título não tem venda de origem', () => {
    flushSync(() => {
      root.render(<ContasReceberTable contas={[conta({ venda_id: null })]} labels={labels} />)
    })
    expect(container.textContent).not.toContain('Ver venda')
  })
})
