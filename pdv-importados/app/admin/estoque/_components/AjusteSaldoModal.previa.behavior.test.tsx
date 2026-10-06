/** @vitest-environment jsdom */
/** UX-019 / P-25 — o ajuste de saldo mostra a diferença (9 → 5 = −4) antes de salvar. */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
const atualizarMock = vi.fn()
vi.mock('@/app/gerente/estoque/actions', () => ({ atualizarEstoqueProduto: (p: unknown) => atualizarMock(p) }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { AjusteSaldoModal, previaAjuste } = await import('./AjusteSaldoModal')

const labels = {
  titulo: 'Ajustar',
  saldoAtual: 'Saldo atual',
  estoqueMinimo: 'Mínimo',
  motivo: 'Motivo',
  observacao: 'Obs',
  cancelar: 'Cancelar',
  salvar: 'Salvar',
  salvando: 'Salvando',
  motivos: [{ value: 'ACERTO_INVENTARIO', label: 'Acerto' }],
}

describe('previaAjuste', () => {
  it('queda, aumento, sem alteração e valor inválido', () => {
    expect(previaAjuste(9, 5)).toBe('Saldo: 9 → 5 (−4)')
    expect(previaAjuste(5, 12)).toBe('Saldo: 5 → 12 (+7)')
    expect(previaAjuste(5, 5)).toBe('Saldo: 5 (sem alteração)')
    expect(previaAjuste(5, null)).toBe('Saldo atual: 5')
    expect(previaAjuste(1.5, 1)).toBe('Saldo: 1,5 → 1 (−0,5)')
  })
})

describe('AjusteSaldoModal — prévia ao digitar', () => {
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

  it('atualiza a diferença conforme o novo saldo é digitado', () => {
    act(() =>
      root.render(
        <AjusteSaldoModal
          alvo={{ produtoId: 'p1', produtoNome: 'Caneca', quantidadeAtual: 9, estoqueMinimo: 2 }}
          onClose={() => {}}
          labels={labels}
        />,
      ),
    )
    const previa = () => document.querySelector('[data-testid="ajuste-previa"]')!.textContent
    expect(previa()).toBe('Saldo: 9 (sem alteração)')
    const input = document.querySelector('input[name="quantidade_atual"]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(input, '5')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(previa()).toBe('Saldo: 9 → 5 (−4)')
  })
})

it('envia snapshot original mesmo ao editar apenas o mínimo', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  atualizarMock.mockResolvedValue({ ok: false, error: 'Conflito sintético' })
  try {
    await act(async () => root.render(
      <AjusteSaldoModal alvo={{ produtoId: 'p1', produtoNome: 'Sintético', quantidadeAtual: 9, estoqueMinimo: 2 }}
        onClose={() => {}} labels={labels} />,
    ))
    const input = document.querySelector('input[name="estoque_minimo"]') as HTMLInputElement
    input.value = '3'
    await act(async () => document.querySelector('form#ajuste-saldo-form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    ))
    expect(atualizarMock).toHaveBeenCalledWith(expect.objectContaining({
      quantidade_atual: 9, estoque_minimo: 3, quantidade_esperada: 9, minimo_esperado: 2,
    }))
    expect(document.body.textContent).toContain('Conflito sintético')
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})
