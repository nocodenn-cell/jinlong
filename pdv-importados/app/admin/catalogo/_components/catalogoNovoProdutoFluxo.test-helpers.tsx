/** Helpers compartilhados pelos testes de entradas do cadastro de produto. */
import { flushSync } from 'react-dom'
import { expect, vi } from 'vitest'
import type { Mensagens } from '@/i18n/getMessages'

export function setInputValue(el: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  nativeSetter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function inputByField(container: HTMLElement, field: string): HTMLInputElement {
  const el = container.querySelector(`input[data-field="${field}"]`) as HTMLInputElement | null
  expect(el, `input data-field=${field}`).toBeTruthy()
  return el!
}

export async function preencherESalvarProdutoDemo(
  container: HTMLElement,
  m: Mensagens,
  criarProdutoMock: ReturnType<typeof vi.fn>,
) {
  setInputValue(inputByField(container, 'nome'), 'Produto Demo Entrada')
  setInputValue(inputByField(container, 'preco_varejo'), '10,00')

  const salvar = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(m.produtos.salvar_produto),
  ) as HTMLButtonElement
  expect(salvar, 'botão Salvar principal').toBeTruthy()
  expect(salvar.textContent).toContain(m.produtos.salvar_produto)
  flushSync(() => {
    salvar.click()
  })

  await vi.waitFor(() => {
    expect(criarProdutoMock).toHaveBeenCalled()
  })
}

export function expectSecaoEssencialVisivel(container: HTMLElement, m: Mensagens) {
  expect(container.textContent).toContain(m.produtos.secao_essencial)
  expect(container.textContent).toContain(m.produtos.preco_varejo)
  expect(container.textContent).toContain(m.produtos.salvar_produto)
  expect(container.textContent).toContain(m.produtos.hint_cadastro_scanner)
}
