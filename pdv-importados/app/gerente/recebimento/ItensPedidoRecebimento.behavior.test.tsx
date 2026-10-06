/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it } from 'vitest'
import { ItensPedidoRecebimento, produtosPendentes } from './ItensPedidoRecebimento'
import type { OcItemDTO } from '../compras/actions'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const itens = [{ produto_id: 'a', produto_nome: 'Caneca', saldo_pendente: 10 }, { produto_id: 'b', produto_nome: 'Garrafa', saldo_pendente: 5 }] as OcItemDTO[]
let container: HTMLDivElement
let root: Root
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(() => { act(() => root.unmount()); container.remove() })
function quantidade(index: number, value: string) {
  const input = container.querySelectorAll('input[type="number"]')[index]
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
it('recebimento parcial exige algum item positivo e rejeita valores acima do saldo', () => {
  act(() => root.render(<ItensPedidoRecebimento itens={itens} zh={false} loading={false} />))
  const button = container.querySelector('button')!
  expect(button.disabled).toBe(true)
  act(() => quantidade(1, '3'))
  expect(button.disabled).toBe(false)
  act(() => quantidade(0, '11'))
  expect(button.disabled).toBe(true)
  expect(container.querySelector('[role="alert"]')).toBeTruthy()
  act(() => quantidade(0, '0'))
  expect(button.disabled).toBe(false)
})
it('reúne linhas do mesmo produto e ignora linhas sem produto ou sem saldo', () => {
  expect(produtosPendentes([...itens, { ...itens[0], saldo_pendente: 2 }, { ...itens[0], produto_id: null }, { ...itens[1], saldo_pendente: 0 }])).toEqual([
    { produto_id: 'a', nome: 'Caneca', quantidade_esperada: 12 }, { produto_id: 'b', nome: 'Garrafa', quantidade_esperada: 5 },
  ])
})
