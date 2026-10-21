/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const criar = vi.fn()
vi.mock('./actions', () => ({
  criarFuncionarioAction: (...a: unknown[]) => criar(...a),
  atualizarFuncionarioAction: vi.fn(),
  obterDadosFuncionarioAction: vi.fn(async () => ({ ok: true, data: null })),
  verificarEmailDisponiveAction: vi.fn(async () => ({ ok: true, data: true })),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))

import { FuncionarioEditarModal, type FuncionarioModalLabels } from './FuncionarioEditarModal'

const L = new Proxy({} as FuncionarioModalLabels, { get: (_t, k) => String(k) })

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  criar.mockReset()
  criar.mockResolvedValue({ ok: false, error: 'x' })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(dadosDisponiveis: boolean) {
  act(() => {
    root.render(
      <FuncionarioEditarModal
        labels={L}
        atorPerfil="DONO"
        funcionario={null}
        onClose={() => {}}
        onSalvo={() => {}}
        dadosDisponiveis={dadosDisponiveis}
      />,
    )
  })
}

function digitar(input: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, v)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('FuncionarioEditarModal — dados complementares', () => {
  it('sem a migration aplicada, não mostra a seção e o create segue igual (sem dados)', async () => {
    render(false)
    expect(document.querySelector('[data-testid="funcionario-dados-complementares"]')).toBeNull()
    digitar(document.querySelector('#func-nome')!, 'Ana')
    digitar(document.querySelector('input[type="email"]')!, 'ana@example.com')
    digitar(document.querySelector('input[type="password"]')!, 'senha-forte-1')
    await act(async () => {
      document.querySelector<HTMLFormElement>('[data-testid="funcionario-form"]')!.requestSubmit()
    })
    expect(criar).toHaveBeenCalledTimes(1)
    expect(criar.mock.calls[0][0].dados).toBeUndefined()
  })

  it('com a migration, mostra os campos, formata o CPF e marca CPF inválido', () => {
    render(true)
    expect(document.querySelector('[data-testid="funcionario-dados-complementares"]')).not.toBeNull()
    const cpf = document.querySelector<HTMLInputElement>('#func-cpf')!
    act(() => digitar(cpf, '52998224724'))
    expect(cpf.value).toBe('529.982.247-24')
    expect(cpf.getAttribute('aria-invalid')).toBe('true')
    act(() => digitar(cpf, '52998224725'))
    expect(cpf.getAttribute('aria-invalid')).toBeNull()
  })

  it('envia os dados opcionais no create', async () => {
    render(true)
    digitar(document.querySelector('#func-nome')!, 'Ana')
    digitar(document.querySelector('input[type="email"]')!, 'ana@example.com')
    digitar(document.querySelector('input[type="password"]')!, 'senha-forte-1')
    act(() => {
      digitar(document.querySelector('#func-cpf')!, '52998224725')
      digitar(document.querySelector('#func-cargo')!, 'Caixa')
    })
    await act(async () => {
      document.querySelector<HTMLFormElement>('[data-testid="funcionario-form"]')!.requestSubmit()
    })
    expect(criar.mock.calls[0][0].dados).toMatchObject({ cpf: '529.982.247-25', cargo: 'Caixa' })
  })
})
