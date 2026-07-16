/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const atualizarEstoqueProdutoMock = vi.fn()
const routerRefreshMock = vi.fn()

vi.mock('@/app/gerente/estoque/actions', () => ({
  atualizarEstoqueProduto: (...args: unknown[]) => atualizarEstoqueProdutoMock(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}))

import { AjusteSaldoModal } from '@/app/admin/estoque/_components/AjusteSaldoModal'

const LABELS = {
  titulo: 'Ajustar saldo',
  saldoAtual: 'Saldo atual',
  estoqueMinimo: 'Estoque mínimo',
  motivo: 'Motivo',
  observacao: 'Observação',
  cancelar: 'Cancelar',
  salvar: 'Salvar ajuste',
  salvando: 'Salvando…',
  motivos: [{ value: 'ACERTO_INVENTARIO', label: 'Acerto de inventário' }],
}

const ALVO = { produtoId: 'p1', produtoNome: 'Produto X', quantidadeAtual: 10, estoqueMinimo: 2 }

let container: HTMLDivElement
let root: Root

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui)
  })
}

beforeEach(() => {
  atualizarEstoqueProdutoMock.mockReset()
  routerRefreshMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.style.overflow = ''
})

describe('AjusteSaldoModal — usa o DragonModal (SSoT de diálogo, com focus-trap)', () => {
  it('renderiza como role=dialog com aria-modal e título referenciado', () => {
    render(<AjusteSaldoModal alvo={ALVO} onClose={() => {}} labels={LABELS} />)
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(container.textContent).toContain('Ajustar saldo')
    expect(container.textContent).toContain('Produto X')
  })

  it('botão Salvar (no footer, fora do <form>) envia o form via atributo form=', async () => {
    atualizarEstoqueProdutoMock.mockResolvedValue({ ok: true })
    render(<AjusteSaldoModal alvo={ALVO} onClose={() => {}} labels={LABELS} />)

    const form = container.querySelector('form') as HTMLFormElement
    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === LABELS.salvar,
    ) as HTMLButtonElement

    expect(form.id).toBeTruthy()
    expect(submitBtn.getAttribute('form')).toBe(form.id)

    await act(async () => {
      submitBtn.click()
    })

    expect(atualizarEstoqueProdutoMock).toHaveBeenCalledTimes(1)
    expect(routerRefreshMock).toHaveBeenCalledTimes(1)
  })

  it('erro do servidor é exibido, sem fechar o modal', async () => {
    atualizarEstoqueProdutoMock.mockResolvedValue({ ok: false, error: 'Motivo obrigatório.' })
    render(<AjusteSaldoModal alvo={ALVO} onClose={() => {}} labels={LABELS} />)

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === LABELS.salvar,
    ) as HTMLButtonElement
    await act(async () => {
      submitBtn.click()
    })

    expect(container.textContent).toContain('Motivo obrigatório.')
    expect(routerRefreshMock).not.toHaveBeenCalled()
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  })
})
