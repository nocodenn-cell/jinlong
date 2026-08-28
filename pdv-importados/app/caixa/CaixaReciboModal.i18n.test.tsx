/** @vitest-environment jsdom */
/**
 * Hardening i18n go-live — CaixaReciboModal (recibo de venda, D0).
 *
 * O corpo do recibo (título do cupom, subtotal, total, formas de pagamento)
 * já era construído via `buildReciboLabels(m)` — catálogo, correto. Só a
 * barra de ferramentas do modal (título do diálogo, botões Imprimir/Fechar,
 * tooltips) estava hardcoded em PT, inconsistente com o resto do mesmo
 * arquivo. Este teste prova que a barra de ferramentas agora segue o idioma
 * da sessão nos dois idiomas, sem tocar em valores, cálculos, pagamentos ou
 * identificação da venda.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { CaixaReciboModal, type ReciboVenda } from '@/app/caixa/CaixaReciboModal'
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
  itens: [
    { nome: 'Produto teste', quantidade: 2, precoUnitario: 10, precoOriginal: 10, tipoPreco: 'VAREJO' },
  ],
  pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 20 }],
  totalBruto: 20,
  totalDesconto: 0,
  totalLiquidoComGerente: 20,
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
  disconnect: vi.fn(async () => {}),
}

function renderModal(m: ReturnType<typeof getMessages>) {
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
}

describe('CaixaReciboModal — barra de ferramentas no idioma da sessão', () => {
  it('PT: título, imprimir e fechar aparecem em português', () => {
    const m = getMessages('pt')
    renderModal(m)

    expect(container.textContent).toContain(m.caixa.modal_recibo_venda_titulo)
    expect(container.textContent).toContain(m.caixa.btn_imprimir_comprovante)
    expect(container.textContent).toContain(m.caixa.btn_fechar_comprovante)

    // não mexe no corpo do recibo (já catalog-driven) nem em valores/venda
    expect(container.textContent).toContain(m.caixa.recibo.total)
    expect(container.textContent).toContain('Produto teste')
    expect(container.textContent).toContain('venda-teste-0001'.slice(0, 8).toUpperCase())
  })

  it('中文: título, imprimir e fechar aparecem em chinês, não em português', () => {
    const m = getMessages('zh')
    const mPt = getMessages('pt')
    renderModal(m)

    expect(container.textContent).toContain(m.caixa.modal_recibo_venda_titulo)
    expect(container.textContent).toContain(m.caixa.btn_imprimir_comprovante)
    expect(container.textContent).toContain(m.caixa.btn_fechar_comprovante)
    expect(container.textContent).not.toContain(mPt.caixa.modal_recibo_venda_titulo)
    expect(container.textContent).not.toContain(mPt.caixa.btn_imprimir_comprovante)
  })

  it('o tooltip do botão de impressão também segue o idioma', () => {
    const m = getMessages('zh')
    renderModal(m)

    const printBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(m.caixa.btn_imprimir_comprovante),
    ) as HTMLButtonElement
    expect(printBtn.title).toBe(m.caixa.modal_recibo_venda_imprimir_janela_hint)
  })
})
