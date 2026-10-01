/** @vitest-environment jsdom */
/**
 * UX-012 — suspensão explícita: badge de status, botões "Suspender"/"Liberar" com confirmação,
 * motivo obrigatório ao suspender e limpo ao liberar. Mesma action de servidor de antes.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const atualizarMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('@/app/gerente/suspensao/actions', () => ({
  atualizarSuspensaoVendas: (...a: unknown[]) => atualizarMock(...a),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { SuspensaoContent } = await import('./SuspensaoContent')
const { AdminV2SessionProvider } = await import('@/components/ui/admin-v2/AdminV2SessionContext')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  atualizarMock.mockReset()
  refreshMock.mockReset()
  atualizarMock.mockResolvedValue({ success: true, data: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(statusInicial: { suspensas: boolean; motivo: string }) {
  act(() =>
    root.render(
      <AdminV2SessionProvider idioma="pt">
        <SuspensaoContent statusInicial={statusInicial} />
      </AdminV2SessionProvider>,
    ),
  )
}
const botao = (txt: string, scope: ParentNode = document) =>
  Array.from(scope.querySelectorAll('button')).find((b) => b.textContent === txt) as HTMLButtonElement | undefined

function digitarMotivo(v: string) {
  const ta = container.querySelector('#suspensao-motivo') as HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(ta, v)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('SuspensaoContent (UX-012)', () => {
  it('ativas: badge "Vendas ativas", sem checkbox, "Suspender vendas" desabilitado sem motivo', () => {
    render({ suspensas: false, motivo: 'texto antigo de teste' })
    expect(container.textContent).toContain('Vendas ativas')
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    // motivo antigo não é reaproveitado com vendas ativas
    expect((container.querySelector('#suspensao-motivo') as HTMLTextAreaElement).value).toBe('')
    expect(botao('Suspender vendas')!.disabled).toBe(true)
    digitarMotivo('   ')
    expect(botao('Suspender vendas')!.disabled).toBe(true)
    digitarMotivo('Inventário')
    expect(botao('Suspender vendas')!.disabled).toBe(false)
  })

  it('suspender exige confirmação; cancelar não chama a action', async () => {
    render({ suspensas: false, motivo: '' })
    digitarMotivo('Inventário')
    act(() => botao('Suspender vendas')!.click())
    expect(atualizarMock).not.toHaveBeenCalled()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    act(() => botao('Cancelar', dialog)!.click())
    expect(atualizarMock).not.toHaveBeenCalled()
  })

  it('confirmar suspende com o motivo e passa a exibir "Vendas suspensas" e "Liberar vendas"', async () => {
    render({ suspensas: false, motivo: '' })
    digitarMotivo('  Inventário  ')
    act(() => botao('Suspender vendas')!.click())
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    await act(async () => {
      botao('Suspender vendas', dialog)!.click()
      await Promise.resolve()
    })
    expect(atualizarMock).toHaveBeenCalledWith(true, 'Inventário')
    expect(container.textContent).toContain('Vendas suspensas')
    expect(container.textContent).toContain('Motivo: Inventário')
    expect(botao('Liberar vendas')).toBeTruthy()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('liberar confirma e limpa o motivo (action recebe false e string vazia)', async () => {
    render({ suspensas: true, motivo: 'Inventário' })
    expect(container.textContent).toContain('Vendas suspensas')
    act(() => botao('Liberar vendas')!.click())
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    await act(async () => {
      botao('Liberar vendas', dialog)!.click()
      await Promise.resolve()
    })
    expect(atualizarMock).toHaveBeenCalledWith(false, '')
    expect(container.textContent).toContain('Vendas ativas')
    expect((container.querySelector('#suspensao-motivo') as HTMLTextAreaElement).value).toBe('')
  })

  it('erro do servidor mantém o estado e mostra a mensagem', async () => {
    atualizarMock.mockResolvedValue({ success: false, error: 'Sem permissão' })
    render({ suspensas: false, motivo: '' })
    digitarMotivo('x')
    act(() => botao('Suspender vendas')!.click())
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    await act(async () => {
      botao('Suspender vendas', dialog)!.click()
      await Promise.resolve()
    })
    expect(container.textContent).toContain('Sem permissão')
    expect(container.textContent).toContain('Vendas ativas')
  })
})
