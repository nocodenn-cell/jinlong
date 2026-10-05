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

it('bloqueia texto digitado sem seleção e orienta o item antes de enviar ao servidor', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<NotaManualForm mi={getMessages('pt').estoque.import_nfe}
      semDocumento onPreview={vi.fn()} />))
    const input = container.querySelector<HTMLInputElement>('[role="combobox"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Produto digitado')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const continuar = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Continuar'))!
    await act(async () => continuar.click())
    expect(preview).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Item 1: selecione o produto') }))
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('selecione o produto na lista')
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})
