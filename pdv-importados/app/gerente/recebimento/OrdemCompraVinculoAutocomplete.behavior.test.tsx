/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OcListaDTO } from '../compras/actions'

/**
 * S8/RM-14, PR3 — campo opcional "Vincular a uma Ordem de Compra". Prova que
 * (a) sem seleção o hidden input `ordem_compra_id` fica vazio — o mesmo
 * contrato que `criarRemessaConferencia` já trata como "sem vínculo" (PR1);
 * (b) escolher uma OC grava o id certo no hidden input; (c) "Trocar" limpa a
 * seleção. A recusa de OC já RECEBIDA é validação de servidor (PR1), não
 * responsabilidade deste componente.
 */

const listarOrdensCompraElegiveisParaVinculoMock = vi.fn()

vi.mock('../compras/actions', () => ({
  listarOrdensCompraElegiveisParaVinculo: (termo?: string) =>
    listarOrdensCompraElegiveisParaVinculoMock(termo),
}))

const { OrdemCompraVinculoAutocomplete } = await import('./OrdemCompraVinculoAutocomplete')

const ocConfirmada: OcListaDTO = {
  id: 'oc-11112222-3333-4444-5555-666677778888',
  fornecedor_id: 'f1',
  fornecedor_nome: 'Fornecedor Alfa',
  status: 'CONFIRMADA',
  data_emissao: '2026-09-01',
  data_prevista_chegada: null,
  observacao: null,
  total_itens: 3,
  valor_total: 100,
  created_at: '2026-09-01T00:00:00Z',
  pedido_total: 10,
  recebido_total: 4,
  pendente_total: 6,
  encerrada_com_falta: false,
  encerramento_motivo: null,
}

const statusLabels = { CONFIRMADA: 'Confirmada', EM_TRANSITO: 'Em trânsito' }

describe('OrdemCompraVinculoAutocomplete (S8/RM-14, PR3)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    listarOrdensCompraElegiveisParaVinculoMock.mockReset()
    listarOrdensCompraElegiveisParaVinculoMock.mockResolvedValue([ocConfirmada])
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  function render() {
    act(() => {
      root.render(
        <OrdemCompraVinculoAutocomplete
          placeholder="Busque por fornecedor (opcional)"
          semResultadosLabel="Nenhuma ordem de compra em aberto encontrada."
          minimoLabel="Digite ao menos 2 caracteres."
          limparLabel="Trocar"
          statusLabels={statusLabels}
        />,
      )
    })
  }

  function hiddenValue(): string {
    return (container.querySelector('input[name="ordem_compra_id"]') as HTMLInputElement).value
  }

  it('sem seleção: hidden input começa vazio — recebimento sem vínculo continua igual a hoje', () => {
    render()
    expect(hiddenValue()).toBe('')
  })

  it('buscar e escolher uma OC grava o id certo no hidden input', async () => {
    render()
    const input = container.querySelector('input[role="combobox"]') as HTMLInputElement

    act(() => {
      input.dispatchEvent(new Event('focus', { bubbles: true }))
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'Alfa')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listarOrdensCompraElegiveisParaVinculoMock).toHaveBeenCalledWith('Alfa')

    const opcao = Array.from(container.querySelectorAll('button[role="option"]')).find((b) =>
      b.textContent?.includes('Fornecedor Alfa'),
    ) as HTMLButtonElement
    expect(opcao).toBeTruthy()
    // Rótulo do status resolvido a partir de statusLabels (i18n), não do código cru —
    // checado antes do clique, enquanto a lista de opções ainda está na tela.
    expect(opcao.textContent).toContain('Confirmada')
    expect(opcao.textContent).not.toContain('CONFIRMADA')

    act(() => {
      opcao.click()
    })

    expect(hiddenValue()).toBe(ocConfirmada.id)
  })

  it('"Trocar" limpa a seleção — volta ao estado "sem vínculo"', async () => {
    render()
    const input = container.querySelector('input[role="combobox"]') as HTMLInputElement

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'Alfa')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
      await Promise.resolve()
    })
    const opcao = Array.from(container.querySelectorAll('button[role="option"]'))[0] as HTMLButtonElement
    act(() => opcao.click())
    expect(hiddenValue()).toBe(ocConfirmada.id)

    const trocar = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Trocar'),
    ) as HTMLButtonElement
    act(() => trocar.click())

    expect(hiddenValue()).toBe('')
  })

  it('sem resultados mostra a mensagem certa e não quebra', async () => {
    listarOrdensCompraElegiveisParaVinculoMock.mockResolvedValue([])
    render()
    const input = container.querySelector('input[role="combobox"]') as HTMLInputElement

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'zz')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Nenhuma ordem de compra em aberto encontrada.')
    expect(hiddenValue()).toBe('')
  })
})
