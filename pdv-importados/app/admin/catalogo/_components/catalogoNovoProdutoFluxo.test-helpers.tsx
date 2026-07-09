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
  const nome = container.querySelector('input[autocomplete="off"]') as HTMLInputElement
  setInputValue(nome, 'Produto Demo Entrada')

  const precoInputs = Array.from(container.querySelectorAll('input[inputmode="decimal"]'))
  const precoVarejo = precoInputs[0] as HTMLInputElement
  setInputValue(precoVarejo, '10,00')

  const gatilho = container.querySelector('input[inputmode="numeric"]') as HTMLInputElement
  setInputValue(gatilho, '6')

  const salvar = container.querySelector('button.app-btn-accent') as HTMLButtonElement
  expect(salvar, 'botão Salvar principal').toBeTruthy()
  flushSync(() => {
    salvar.click()
  })

  await vi.waitFor(() => {
    expect(criarProdutoMock).toHaveBeenCalled()
  })
}

export function expectPayloadComGatilho(criarProdutoMock: ReturnType<typeof vi.fn>) {
  const payload = criarProdutoMock.mock.calls[0]?.[0] as { quantidade_gatilho_atacado?: number | null }
  expect(payload.quantidade_gatilho_atacado).toBe(6)
}

export function expectSecaoEssencialVisivel(container: HTMLElement, m: Mensagens) {
  expect(container.textContent).toContain(m.produtos.secao_essencial)
  expect(container.textContent).toContain(m.produtos.preco_varejo)
  expect(container.textContent).toContain(m.produtos.qtd_gatilho_atacado)
}
