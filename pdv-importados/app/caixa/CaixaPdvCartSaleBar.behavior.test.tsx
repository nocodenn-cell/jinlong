/** @vitest-environment jsdom */
/**
 * UX-002 — total do cupom não pode dividir linha com os botões (em 788/1062px o valor
 * ficava sobreposto ao "Excluir venda"). Estrutura esperada: linha 1 = total; linha 2 = Excluir | Finalizar.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { CaixaPdvCartSaleBar } from './CaixaPdvCartSaleBar'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const m = getMessages('pt')

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

function render(over: Partial<React.ComponentProps<typeof CaixaPdvCartSaleBar>> = {}) {
  const onExcluirVenda = vi.fn()
  const onFinalizar = vi.fn()
  act(() => {
    root.render(
      <CaixaPdvCartSaleBar
        m={m}
        onExcluirVenda={onExcluirVenda}
        onFinalizar={onFinalizar}
        finalizando={false}
        movimentandoCaixa={false}
        caixaAberto
        itensLength={2}
        buscando={false}
        carregandoRegras={false}
        totalLiquidoComGerente={1234.5}
        moedaPrefixo="R$"
        {...over}
      />,
    )
  })
  return { onExcluirVenda, onFinalizar }
}

describe('CaixaPdvCartSaleBar — layout do rodapé (UX-002)', () => {
  it('mostra o total completo, sem truncar, e mantém o data-testid', () => {
    render()
    const total = container.querySelector('[data-testid="caixa-total-liquido"]') as HTMLElement
    expect(total.textContent).toContain('1.234,50')
    expect(total.getAttribute('data-total-liquido')).toBe('1234.50')
    expect(total.className).toContain('whitespace-nowrap')
  })

  it('total e botões ficam em linhas diferentes (nenhum botão no mesmo bloco do total)', () => {
    render()
    const total = container.querySelector('[data-testid="caixa-total-liquido"]') as HTMLElement
    const excluir = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === m.caixa.cart_bar_excluir_venda,
    ) as HTMLButtonElement
    const finalizar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === m.caixa.finalizar_venda,
    ) as HTMLButtonElement

    const linhaTotal = total.parentElement as HTMLElement
    expect(linhaTotal.contains(excluir)).toBe(false)
    expect(linhaTotal.contains(finalizar)).toBe(false)
    expect(excluir.parentElement).toBe(finalizar.parentElement)
    expect(
      excluir.compareDocumentPosition(finalizar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('ações continuam funcionando e Excluir respeita caixa fechado', () => {
    const { onExcluirVenda, onFinalizar } = render()
    const botoes = Array.from(container.querySelectorAll('button'))
    act(() => botoes.find((b) => b.textContent === m.caixa.cart_bar_excluir_venda)!.click())
    act(() => botoes.find((b) => b.textContent === m.caixa.finalizar_venda)!.click())
    expect(onExcluirVenda).toHaveBeenCalledTimes(1)
    expect(onFinalizar).toHaveBeenCalledTimes(1)

    render({ caixaAberto: false })
    const excluir = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === m.caixa.cart_bar_excluir_venda,
    ) as HTMLButtonElement
    expect(excluir.disabled).toBe(true)
  })

  it('com desconto, o resumo aparece abaixo do total na mesma linha 1', () => {
    render({ totalBruto: 100, totalDesconto: 10 })
    const total = container.querySelector('[data-testid="caixa-total-liquido"]') as HTMLElement
    expect(total.parentElement!.textContent).toContain(m.caixa.bruto)
    expect(total.parentElement!.textContent).toContain(m.caixa.descontos_regras)
  })
})
