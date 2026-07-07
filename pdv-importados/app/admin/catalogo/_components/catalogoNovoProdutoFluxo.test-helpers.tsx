/** Helpers compartilhados pelos testes de entradas do cadastro de produto. */
import { flushSync } from 'react-dom'
import { expect, vi } from 'vitest'
import type { Mensagens } from '@/i18n/getMessages'

export function setInputValue(el: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  nativeSetter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export async function preencherESalvarProdutoDemo(
  container: HTMLElement,
  m: Mensagens,
  criarProdutoMock: ReturnType<typeof vi.fn>,
) {
  const nome = container.querySelector('input') as HTMLInputElement
  setInputValue(nome, 'Produto Demo Entrada')

  const vendaTab = Array.from(container.querySelectorAll('[role="tab"]')).find((el) =>
    el.textContent?.includes(m.produtos.aba_venda_atacado),
  ) as HTMLButtonElement
  flushSync(() => vendaTab.click())

  const precoInput = container.querySelector('input[inputmode="decimal"]') as HTMLInputElement
  setInputValue(precoInput, '10,00')

  const salvar = Array.from(container.querySelectorAll('button')).find((el) =>
    el.textContent?.includes(m.comum.salvar),
  ) as HTMLButtonElement
  flushSync(() => {
    salvar.click()
  })

  await vi.waitFor(() => {
    expect(criarProdutoMock).toHaveBeenCalled()
    expect(container.querySelector('[data-testid="faixas-editor"]')).not.toBeNull()
  })
}

export function expectFluxoAtacadoAberto(container: HTMLElement, m: Mensagens) {
  expect(container.querySelector('[data-testid="faixas-editor"]')).not.toBeNull()
  expect(
    Array.from(container.querySelectorAll('button')).some((el) => el.textContent?.includes(m.comum.concluir)),
  ).toBe(true)
}
