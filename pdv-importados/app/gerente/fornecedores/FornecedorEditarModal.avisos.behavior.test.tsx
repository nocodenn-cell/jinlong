/** @vitest-environment jsdom */
/** UX-020 — avisos NÃO bloqueantes: nome duplicado e CNPJ com dígito verificador errado. */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

const salvarMock = vi.fn()
vi.mock('./actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./actions')>()
  return {
    ...actual,
    // Contrato atual do modal: createSupplier (alias canônico) → salvarFornecedorAction.
    createSupplier: (...a: unknown[]) => salvarMock(...a),
    salvarFornecedorAction: (...a: unknown[]) => salvarMock(...a),
  }
})
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { FornecedorEditarModal } = await import('./FornecedorEditarModal')
const m = getMessages('pt')

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  salvarMock.mockReset()
  salvarMock.mockResolvedValue({ ok: true, fornecedor: { id: 'n', nome: 'x', cnpj: '1', loja_id: 'l', created_at: '', updated_at: '' } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function digitar(el: HTMLInputElement, v: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function abrir(nomes: string[]) {
  act(() =>
    root.render(
      <FornecedorEditarModal idioma="pt" fornecedor={null} nomesExistentes={nomes} onClose={() => {}} onSalvo={() => {}} />,
    ),
  )
}

describe('FornecedorEditarModal — avisos (UX-020)', () => {
  it('nome já existente mostra aviso, sem bloquear o envio', async () => {
    abrir(['Papel & Cia'])
    digitar(document.querySelector('#forn-nome') as HTMLInputElement, 'papel & cia')
    expect(document.body.textContent).toContain(m.fornecedores.aviso_nome_duplicado)
    digitar(document.querySelector('#forn-cnpj') as HTMLInputElement, '11222333000181')
    await act(async () => {
      ;(document.querySelector('#forn-form') as HTMLFormElement).requestSubmit()
      await Promise.resolve()
    })
    expect(salvarMock).toHaveBeenCalledTimes(1)
  })

  it('nome novo não mostra aviso', () => {
    abrir(['Papel & Cia'])
    digitar(document.querySelector('#forn-nome') as HTMLInputElement, 'Fornecedor Novo')
    expect(document.body.textContent).not.toContain(m.fornecedores.aviso_nome_duplicado)
  })

  it('CNPJ de 14 dígitos com DV errado avisa; CNPJ válido não; e o cadastro continua permitido', async () => {
    abrir([])
    const nome = document.querySelector('#forn-nome') as HTMLInputElement
    const cnpj = document.querySelector('#forn-cnpj') as HTMLInputElement
    digitar(nome, 'Acme')
    digitar(cnpj, '77777777777777')
    expect(document.body.textContent).toContain(m.fornecedores.aviso_cnpj_dv)
    await act(async () => {
      ;(document.querySelector('#forn-form') as HTMLFormElement).requestSubmit()
      await Promise.resolve()
    })
    expect(salvarMock).toHaveBeenCalledTimes(1)
    digitar(cnpj, '11222333000181')
    expect(document.body.textContent).not.toContain(m.fornecedores.aviso_cnpj_dv)
  })
})
