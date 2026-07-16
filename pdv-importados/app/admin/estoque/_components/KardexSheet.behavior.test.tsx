/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const obterKardexProdutoMock = vi.fn()

vi.mock('../actions', () => ({
  obterKardexProduto: (...args: unknown[]) => obterKardexProdutoMock(...args),
}))

import { KardexSheet } from '@/app/admin/estoque/_components/KardexSheet'

const LABELS = {
  titulo: 'Kardex',
  semMovimentos: 'Sem movimentações registradas',
  semMovimentosSub: 'As entradas e saídas aparecerão aqui.',
  erroCarregar: 'Não foi possível carregar o histórico',
  tentarNovamente: 'Tentar novamente',
  tipoMap: { VENDA: 'Venda' },
}

const ALVO = { produtoId: 'p1', produtoNome: 'Produto Teste' }

let container: HTMLDivElement
let root: Root

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui)
  })
}

beforeEach(() => {
  obterKardexProdutoMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.style.overflow = ''
})

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('KardexSheet — estado de erro (regressão: falha não deve parecer "sem movimentações")', () => {
  it('erro de carregamento mostra a mensagem de erro, não o empty state', async () => {
    obterKardexProdutoMock.mockResolvedValue({ ok: false, error: 'Sessão expirada ou sem permissão.' })
    render(<KardexSheet alvo={ALVO} onClose={() => {}} labels={LABELS} />)
    await flush()

    expect(container.textContent).toContain(LABELS.erroCarregar)
    expect(container.textContent).not.toContain(LABELS.semMovimentos)
  })

  it('botão "tentar novamente" refaz a chamada e recupera do erro', async () => {
    obterKardexProdutoMock
      .mockResolvedValueOnce({ ok: false, error: 'Falha de rede.' })
      .mockResolvedValueOnce({ ok: true, rows: [] })
    render(<KardexSheet alvo={ALVO} onClose={() => {}} labels={LABELS} />)
    await flush()
    expect(container.textContent).toContain(LABELS.erroCarregar)

    const retryBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === LABELS.tentarNovamente,
    ) as HTMLButtonElement
    expect(retryBtn).toBeTruthy()
    await act(async () => {
      retryBtn.click()
    })
    await flush()

    expect(obterKardexProdutoMock).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain(LABELS.semMovimentos)
    expect(container.textContent).not.toContain(LABELS.erroCarregar)
  })

  it('sucesso com dados não mostra estado de erro nem vazio', async () => {
    obterKardexProdutoMock.mockResolvedValue({
      ok: true,
      rows: [
        {
          id: 'm1',
          created_at: new Date().toISOString(),
          tipo_codigo: 'VENDA',
          quantidade_delta: -2,
          observacao: null,
        },
      ],
    })
    render(<KardexSheet alvo={ALVO} onClose={() => {}} labels={LABELS} />)
    await flush()

    expect(container.textContent).not.toContain(LABELS.erroCarregar)
    expect(container.textContent).not.toContain(LABELS.semMovimentos)
    expect(container.textContent).toContain('Venda')
  })
})

describe('KardexSheet — foco contido no painel (regressão: sheets não tinham focus-trap)', () => {
  it('Shift+Tab a partir do primeiro elemento focável cicla para o último (não vaza para trás do overlay)', async () => {
    obterKardexProdutoMock.mockResolvedValue({ ok: true, rows: [] })
    render(<KardexSheet alvo={ALVO} onClose={() => {}} labels={LABELS} />)
    await flush()

    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])'),
    )
    expect(focusables.length).toBeGreaterThan(0)
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    first.focus()
    expect(document.activeElement).toBe(first)

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    act(() => {
      document.dispatchEvent(event)
    })

    expect(document.activeElement).toBe(last)
  })
})
