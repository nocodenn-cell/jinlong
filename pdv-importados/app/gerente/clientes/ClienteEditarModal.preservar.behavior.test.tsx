/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

const criar = vi.fn()

vi.mock('@/app/admin/clientes/actions', () => ({
  criarClienteAction: (...args: unknown[]) => criar(...args),
  atualizarClienteAction: vi.fn(),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { ClienteEditarModal } = await import('./ClienteEditarModal')
const m = getMessages('pt')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  criar.mockReset()
  criar.mockResolvedValue({ ok: false, error: 'Já existe um cliente com este CPF/CNPJ nesta loja.' })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function digitar(el: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, valor)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('ClienteEditarModal — erro preserva preenchimento', () => {
  it('mantém nome, documento e telefone quando o cadastro falha', async () => {
    act(() => {
      root.render(
        <ClienteEditarModal
          idioma="pt"
          locale="pt-BR"
          messages={m}
          cliente={null}
          onClose={() => {}}
          onSalvo={() => {}}
        />,
      )
    })
    digitar(document.querySelector('#cli-nome') as HTMLInputElement, 'Ana Souza')
    digitar(document.querySelector('#cli-doc') as HTMLInputElement, '52998224725')
    digitar(document.querySelector('#cli-tel') as HTMLInputElement, '11987654321')
    const consent = document.querySelector('#lgpd-consent') as HTMLInputElement
    act(() => {
      consent.click()
    })
    await act(async () => {
      ;(document.querySelector('#cliente-form') as HTMLFormElement).requestSubmit()
      await Promise.resolve()
    })
    expect(criar).toHaveBeenCalled()
    expect((document.querySelector('#cli-nome') as HTMLInputElement).value).toBe('Ana Souza')
    expect((document.querySelector('#cli-doc') as HTMLInputElement).value).toContain('529')
    const telefone = (document.querySelector('#cli-tel') as HTMLInputElement).value
    expect(telefone.replace(/\D/g, '')).toBe('11987654321')
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })
})
