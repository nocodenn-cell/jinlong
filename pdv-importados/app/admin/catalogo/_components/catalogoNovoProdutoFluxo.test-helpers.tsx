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

  // Gatilho só aparece em "Mais detalhes" (modo completo)
  const maisDetalhes = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(m.produtos.modo_completo),
  )
  expect(maisDetalhes, 'botão Mais detalhes').toBeTruthy()
  flushSync(() => {
    maisDetalhes!.click()
  })

  const labelGatilho = Array.from(container.querySelectorAll('label')).find((l) =>
    (l.textContent ?? '').includes(m.produtos.qtd_gatilho_atacado),
  )
  expect(labelGatilho, 'label gatilho atacado').toBeTruthy()
  const gatilho = labelGatilho!.querySelector('input') as HTMLInputElement
  setInputValue(gatilho, '6')

  const salvar = container.querySelector('button.app-btn-accent') as HTMLButtonElement
  expect(salvar, 'botão Salvar principal').toBeTruthy()
  expect(salvar.textContent).toContain(m.produtos.salvar_produto)
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
  expect(container.textContent).toContain(m.produtos.salvar_produto)
  expect(container.textContent).toContain(m.produtos.hint_cadastro_scanner)
}
