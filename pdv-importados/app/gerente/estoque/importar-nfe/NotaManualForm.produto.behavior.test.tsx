/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { NotaManualForm } from './NotaManualForm'

const preview = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => vi.fn())
vi.mock('./actions', () => ({ previewNotaManualNfe: preview }))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: toast }))
vi.mock('@/app/gerente/recebimento/actions', () => ({
  buscarProdutosRecebimento: vi.fn(async () => ({ success: true, data: [] })),
}))
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

it('bloqueia nome vazio e aceita nome digitado de produto novo no mesmo formulário', async () => {
  vi.clearAllMocks()
  preview.mockResolvedValue({ success: false, error: 'Resposta simulada' })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<NotaManualForm mi={getMessages('pt').estoque.import_nfe}
      semDocumento onPreview={vi.fn()} />))
    const continuar = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Continuar'))!
    await act(async () => continuar.click())
    expect(preview).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Item 1: informe o nome') }))
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    await preencher(container.querySelector<HTMLInputElement>('[role="combobox"]')!, 'Produto novo')
    await preencher(container.querySelector<HTMLInputElement>('[placeholder="0,00"]')!, '50,00')
    await act(async () => {
      const condicao = container.querySelector('select')!
      condicao.value = '0'
      condicao.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => continuar.click())
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({
      sem_documento: true,
      itens: [expect.objectContaining({ nome_produto: 'Produto novo', produto_id: undefined, q_com: 1, v_un_com: 50 })],
      duplicatas: [expect.objectContaining({ valor: 50 })],
    }))
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})

async function preencher(input: HTMLInputElement, valor: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
