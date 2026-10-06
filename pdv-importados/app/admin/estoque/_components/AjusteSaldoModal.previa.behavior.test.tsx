/** @vitest-environment jsdom */
/** UX-019 / P-25 — o ajuste de saldo mostra a diferença (9 → 5 = −4) antes de salvar. */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/gerente/estoque/actions', () => ({ atualizarEstoqueProduto: vi.fn() }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { AjusteSaldoModal, previaAjuste, previaRetirada } = await import('./AjusteSaldoModal')

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
  quantidadeRetirar: 'Quantidade a retirar',
  quantidadeContada: 'Quantidade contada',
  saldoAnterior: 'Saldo anterior',
  referenciaDoc: 'Referência',
  referenciaDocHint: 'Opcional',
  confirmarRetirada: 'Confirmar retirada',
  confirmarAjuste: 'Confirmar ajuste',
  codigoLabel: 'Código',
  unidadeLabel: 'Unidade',
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

describe('previaRetirada', () => {
  it('mostra saldo resultante após retirada', () => {
    expect(previaRetirada(10, null)).toBe('Saldo atual: 10')
    expect(previaRetirada(10, 0)).toBe('Saldo atual: 10')
    expect(previaRetirada(10, 4)).toBe('Saldo: 10 → 6 (−4)')
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

  it('modo retirar pede quantidade a sair e mostra contexto', () => {
    act(() =>
      root.render(
        <AjusteSaldoModal
          alvo={{
            produtoId: 'p1',
            produtoNome: 'Parafuso',
            quantidadeAtual: 10,
            estoqueMinimo: 2,
            codigoBarras: '789',
            unidade: 'UN',
            modo: 'retirar',
          }}
          onClose={() => {}}
          labels={{
            ...labels,
            titulo: 'Retirar',
            motivos: [
              { value: 'PERDA', label: 'Perda' },
              { value: 'QUEBRA', label: 'Quebra' },
              { value: 'OUTRO', label: 'Outro' },
            ],
          }}
        />,
      ),
    )
    expect(document.querySelector('[data-testid="ajuste-produto-contexto"]')?.textContent).toContain('Parafuso')
    expect(document.querySelector('input[name="quantidade_retirar"]')).toBeTruthy()
    expect(document.querySelector('input[name="quantidade_atual"]')).toBeNull()
    expect(document.querySelector('input[name="referencia_doc"]')).toBeTruthy()
    const footer = document.body.textContent ?? ''
    expect(footer).toContain('Confirmar retirada')
    const select = document.querySelector('select[name="motivo"]') as HTMLSelectElement
    expect(select.value).toBe('PERDA')
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['PERDA', 'QUEBRA', 'OUTRO'])

    const input = document.querySelector('input[name="quantidade_retirar"]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(input, '3')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(document.querySelector('[data-testid="ajuste-previa"]')!.textContent).toBe(
      'Saldo: 10 → 7 (−3)',
    )
  })

  it('modo ajustar usa quantidade contada e motivos de inventário', () => {
    act(() =>
      root.render(
        <AjusteSaldoModal
          alvo={{
            produtoId: 'p1',
            produtoNome: 'Caneca',
            quantidadeAtual: 9,
            estoqueMinimo: 2,
            codigoBarras: '111',
            unidade: 'UN',
            modo: 'ajustar',
          }}
          onClose={() => {}}
          labels={{
            ...labels,
            titulo: 'Ajustar quantidade',
            motivos: [
              { value: 'ACERTO_INVENTARIO', label: 'Inventário' },
              { value: 'OUTRO', label: 'Outro' },
            ],
          }}
        />,
      ),
    )
    expect(document.querySelector('[data-testid="ajuste-produto-contexto"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Quantidade contada')
    expect(document.body.textContent).toContain('Confirmar ajuste')
    const select = document.querySelector('select[name="motivo"]') as HTMLSelectElement
    expect(select.value).toBe('ACERTO_INVENTARIO')
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['ACERTO_INVENTARIO', 'OUTRO'])
  })
})
