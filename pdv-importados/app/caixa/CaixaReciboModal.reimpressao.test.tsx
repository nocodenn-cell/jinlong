/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { CaixaReciboModal } from '@/app/caixa/CaixaReciboModal'
import type { ReciboVenda } from '@/lib/caixa/reciboTypes'
import type { UseThermalPrinterReturn } from '@/hooks/useThermalPrinter'

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

const venda: ReciboVenda = {
  vendaId: 'venda-teste-0001',
  data: new Date('2026-08-27T12:00:00Z'),
  clienteNome: null,
  itens: [{ nome: 'Produto', quantidade: 1, precoUnitario: 10, precoOriginal: 10, tipoPreco: 'VAREJO' }],
  pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 10 }],
  totalBruto: 10,
  totalDesconto: 0,
  totalLiquidoComGerente: 10,
  descontoGerentePercentual: 0,
  valorDescontoGerente: 0,
  moeda: 'R$',
}
const thermal: UseThermalPrinterReturn = {
  supported: false,
  status: 'idle',
  deviceInfo: null,
  savedInfo: null,
  errorMsg: null,
  connect: vi.fn(async () => {}),
  printRecibo: vi.fn(async () => {}),
  abrirGaveta: vi.fn(async () => true),
  disconnect: vi.fn(async () => {}),
}

describe('CaixaReciboModal — reaberto fora do PDV (detalhe da venda no admin)', () => {
  it('sem onNovaVenda/onFinalizarCaixa não mostra as ações de fluxo do caixa', () => {
    const m = getMessages('pt')
    act(() => {
      root.render(<CaixaReciboModal venda={venda} segundaVia m={m} onClose={() => {}} thermal={thermal} />)
    })
    expect(container.textContent).not.toContain(m.caixa.btn_adicionar_nova_venda)
    expect(container.textContent).not.toContain(m.caixa.btn_finalizar_caixa)
    expect(container.textContent).toContain(m.caixa.recibo.segunda_via)
    expect(container.textContent).toContain(m.caixa.btn_imprimir_comprovante)
  })

  it('no PDV (com as ações) elas continuam aparecendo', () => {
    const m = getMessages('pt')
    act(() => {
      root.render(
        <CaixaReciboModal
          venda={venda}
          m={m}
          onClose={() => {}}
          onNovaVenda={() => {}}
          onFinalizarCaixa={() => {}}
          thermal={thermal}
        />,
      )
    })
    expect(container.textContent).toContain(m.caixa.btn_adicionar_nova_venda)
    expect(container.textContent).toContain(m.caixa.btn_finalizar_caixa)
  })
})
