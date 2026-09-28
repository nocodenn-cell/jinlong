/** @vitest-environment jsdom */
/**
 * G-10 — cancelamento de conta a pagar usava `window.prompt()` nativo pro
 * motivo. Prova que agora é um modal do próprio app (DragonModal), com
 * validação visível em vez de toast solto, e que o motivo digitado chega
 * até `cancelarContaPagarAction`.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cancelarContaPagarActionMock = vi.fn()

vi.mock('./actions', () => ({
  buscarContasPagarAction: vi.fn(),
  cancelarContaPagarAction: (...args: unknown[]) => cancelarContaPagarActionMock(...args),
  exportarContasPagarParaCSVAction: vi.fn(),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const { ContasPagarListClient } = await import('./ContasPagarListClient')

const conta = {
  id: 'c1',
  fornecedor_id: 'f1',
  fornecedor_nome: 'Fornecedor Alfa',
  descricao: 'Compra de mercadoria',
  valor_total: 100,
  valor_pago: 0,
  vencimento: '2026-09-30',
  status: 'PENDENTE' as const,
  nfe_numero: null,
  nfe_importacao_id: null,
  criado_em: '2026-09-17T10:00:00Z',
  loja_id: 'loja-1',
  atrasado: false,
}

let container: HTMLDivElement
let root: Root
let promptSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  class IOStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', IOStub)

  cancelarContaPagarActionMock.mockReset()
  // Se o código voltar a usar window.prompt, este spy denuncia — nunca deve ser chamado.
  promptSpy = vi.spyOn(window, 'prompt')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
  promptSpy.mockRestore()
})

function render() {
  flushSync(() =>
    root.render(
      <ContasPagarListClient
        idioma="pt"
        locale="pt-BR"
        contasIniciais={[conta]}
        hasMoreInicial={false}
        fornecedoresOpts={[]}
        statusInicial="todos"
        periodoInicial=""
      />,
    ),
  )
}

describe('ContasPagarListClient — modal de cancelamento (G-10)', () => {
  it('clicar em Cancelar abre um modal do app, nunca window.prompt', () => {
    render()
    const btnCancelar = container.querySelector('button[aria-label*="Cancelar"]') as HTMLButtonElement
    flushSync(() => btnCancelar.click())

    expect(promptSpy).not.toHaveBeenCalled()
    expect(container.querySelector('#motivo-cancelamento')).toBeTruthy()
  })

  it('motivo curto demais mostra erro visível, não confirma o cancelamento', () => {
    render()
    const btnCancelar = container.querySelector('button[aria-label*="Cancelar"]') as HTMLButtonElement
    flushSync(() => btnCancelar.click())

    const input = container.querySelector('#motivo-cancelamento') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'x')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const btnConfirmar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancelar conta',
    ) as HTMLButtonElement
    act(() => btnConfirmar.click())

    expect(container.textContent).toContain('Motivo deve ter ao menos 2 caracteres.')
    expect(cancelarContaPagarActionMock).not.toHaveBeenCalled()
  })

  it('motivo válido chama cancelarContaPagarAction com o texto digitado', async () => {
    cancelarContaPagarActionMock.mockResolvedValue({ ok: true })
    render()
    const btnCancelar = container.querySelector('button[aria-label*="Cancelar"]') as HTMLButtonElement
    flushSync(() => btnCancelar.click())

    const input = container.querySelector('#motivo-cancelamento') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'Pedido duplicado')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const btnConfirmar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancelar conta',
    ) as HTMLButtonElement
    await act(async () => {
      btnConfirmar.click()
      await Promise.resolve()
    })

    expect(cancelarContaPagarActionMock).toHaveBeenCalledWith('c1', 'Pedido duplicado')
  })
})
