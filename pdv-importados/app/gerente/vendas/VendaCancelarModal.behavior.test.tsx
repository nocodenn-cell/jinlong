/** @vitest-environment jsdom */
/**
 * Regressão — o comprovante de cancelamento montado por `VendaCancelarModal` deve usar
 * `totalEstornado` de `obterDadosComprovanteCancelamento` (total_liquido menos o que já
 * tinha sido devolvido antes), NUNCA `venda.total_liquido` (o total original da venda)
 * nem `res.valorEstornado` da RPC (que só cobre a parcela em DINHEIRO — T7, auditoria
 * 2026-09-27, ver actions.ts). Ver docs/ALINHAMENTO_AMBIENTES_2026-08-20.md — bug
 * original encontrado ao vivo no Chrome real durante o alinhamento pré-treinamento de
 * 2026-08-21.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cancelarVendaGerenteActionMock = vi.fn()
const obterDadosComprovanteCancelamentoMock = vi.fn()

vi.mock('./actions', () => ({
  cancelarVendaGerenteAction: (...args: unknown[]) => cancelarVendaGerenteActionMock(...args),
  obterDadosComprovanteCancelamento: (...args: unknown[]) =>
    obterDadosComprovanteCancelamentoMock(...args),
}))

vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))

import { VendaCancelarModal } from '@/app/gerente/vendas/VendaCancelarModal'
import type { VendaListRow } from '@/app/gerente/vendas/actions'
import type { ComprovanteCancelamento } from '@/app/gerente/vendas/VendaCancelamentoReciboModal'

const m = getMessages('pt')

let container: HTMLDivElement
let root: Root

const VENDA_ATIVA: VendaListRow = {
  id: 'venda-82ad0d34',
  data: '2026-08-21T04:58:40.000Z',
  total_liquido: 112.5, // total ORIGINAL da venda — não deve acabar no comprovante
  total_bruto: 112.5,
  forma_pagamento: 'DINHEIRO',
  status: 'CONCLUIDA',
  caixa_id: 'caixa-1',
  operador_id: 'operador-1',
  qtd_itens_total: 5,
  qtd_itens_distintos: 1,
  primeiro_produto: 'Cabo USB-C 2m',
}

function setTextarea(el: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    setter?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function submitForm(): Promise<void> {
  const form = container.querySelector('#cancelar-venda-form') as HTMLFormElement
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('VendaCancelarModal — comprovante usa o valor realmente estornado', () => {
  it('devolução parcial prévia: comprovante mostra o saldo restante (67,50), não o total original (112,50)', async () => {
    cancelarVendaGerenteActionMock.mockResolvedValue({
      ok: true,
      vendaId: VENDA_ATIVA.id,
      valorEstornado: 67.5,
    })
    obterDadosComprovanteCancelamentoMock.mockResolvedValue({
      itens: [{ nome: 'Cabo USB-C 2m', quantidade: 3, precoUnitario: 22.5 }],
      operadorNome: 'Gerente E2E',
      totalEstornado: 67.5,
    })

    let comprovanteRecebido: ComprovanteCancelamento | null = null

    act(() => {
      root.render(
        <VendaCancelarModal
          venda={VENDA_ATIVA}
          locale="pt-BR"
          m={m}
          onClose={() => {}}
          onCancelado={() => {}}
          onComprovante={(c) => {
            comprovanteRecebido = c
          }}
        />,
      )
    })

    const textarea = container.querySelector('#motivo-cancelamento') as HTMLTextAreaElement
    setTextarea(textarea, 'Cancelamento pós-devolução parcial')

    await submitForm()

    expect(cancelarVendaGerenteActionMock).toHaveBeenCalledTimes(1)
    expect(comprovanteRecebido).not.toBeNull()
    expect(comprovanteRecebido!.totalLiquido).toBe(67.5)
    expect(comprovanteRecebido!.totalLiquido).not.toBe(112.5) // nunca o total original da venda
  })

  it('controle — cancelamento sem devolução prévia: comprovante ainda mostra o valor certo (igual ao total, coincidência esperada)', async () => {
    cancelarVendaGerenteActionMock.mockResolvedValue({
      ok: true,
      vendaId: VENDA_ATIVA.id,
      valorEstornado: 112.5,
    })
    obterDadosComprovanteCancelamentoMock.mockResolvedValue({
      itens: [{ nome: 'Cabo USB-C 2m', quantidade: 5, precoUnitario: 22.5 }],
      operadorNome: 'Gerente E2E',
      totalEstornado: 112.5,
    })

    let comprovanteRecebido: ComprovanteCancelamento | null = null

    act(() => {
      root.render(
        <VendaCancelarModal
          venda={VENDA_ATIVA}
          locale="pt-BR"
          m={m}
          onClose={() => {}}
          onCancelado={() => {}}
          onComprovante={(c) => {
            comprovanteRecebido = c
          }}
        />,
      )
    })

    setTextarea(
      container.querySelector('#motivo-cancelamento') as HTMLTextAreaElement,
      'Cliente desistiu',
    )
    await submitForm()

    expect(comprovanteRecebido!.totalLiquido).toBe(112.5)
  })

  it('T7: venda paga em PIX — valorEstornado da RPC vem 0 (não passa pela gaveta), mas o comprovante mostra o total pago', async () => {
    // Reproduz o bug do relatório: comprovante mostrava "Total estornado R$ 0,00"
    // numa venda de R$ 25,90 paga em PIX, porque usava res.valorEstornado (que só
    // cobre o débito em DINHEIRO no caixa) em vez do total efetivamente estornado.
    cancelarVendaGerenteActionMock.mockResolvedValue({
      ok: true,
      vendaId: VENDA_ATIVA.id,
      valorEstornado: 0, // PIX: RPC não debita a gaveta, valor_estornado vem 0
    })
    obterDadosComprovanteCancelamentoMock.mockResolvedValue({
      itens: [{ nome: 'Cabo USB-C 2m', quantidade: 1, precoUnitario: 25.9 }],
      operadorNome: 'Gerente E2E',
      totalEstornado: 25.9,
    })

    let comprovanteRecebido: ComprovanteCancelamento | null = null

    act(() => {
      root.render(
        <VendaCancelarModal
          venda={VENDA_ATIVA}
          locale="pt-BR"
          m={m}
          onClose={() => {}}
          onCancelado={() => {}}
          onComprovante={(c) => {
            comprovanteRecebido = c
          }}
        />,
      )
    })

    setTextarea(
      container.querySelector('#motivo-cancelamento') as HTMLTextAreaElement,
      'Cliente desistiu (PIX)',
    )
    await submitForm()

    expect(comprovanteRecebido!.totalLiquido).toBe(25.9)
    expect(comprovanteRecebido!.totalLiquido).not.toBe(0)
  })

  it('erro no cancelamento: onComprovante nunca é chamado (nenhum recibo fantasma)', async () => {
    cancelarVendaGerenteActionMock.mockResolvedValue({ ok: false, error: 'venda ja cancelada' })
    const onComprovante = vi.fn()

    act(() => {
      root.render(
        <VendaCancelarModal
          venda={VENDA_ATIVA}
          locale="pt-BR"
          m={m}
          onClose={() => {}}
          onCancelado={() => {}}
          onComprovante={onComprovante}
        />,
      )
    })

    setTextarea(
      container.querySelector('#motivo-cancelamento') as HTMLTextAreaElement,
      'Tentativa que falha',
    )
    await submitForm()

    expect(onComprovante).not.toHaveBeenCalled()
    expect(obterDadosComprovanteCancelamentoMock).not.toHaveBeenCalled()
  })
})
