/** @vitest-environment jsdom */
/**
 * UX-018 — entrada "Sem documento" aceita vários produtos na MESMA confirmação (a RPC já recebe uma
 * lista de itens; o formulário só permitia um). Com pedido, continua um item por vez.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const criarRemessaMock = vi.fn()
const buscarMock = vi.fn()
const toastMock = vi.fn()

vi.mock('./actions', () => ({
  criarRemessaConferencia: (...a: unknown[]) => criarRemessaMock(...a),
  buscarProdutosRecebimento: (...a: unknown[]) => buscarMock(...a),
}))
vi.mock('../compras/actions', () => ({
  listarOrdensCompraElegiveisParaVinculo: vi.fn(async () => []),
  obterOrdemCompraDetalhe: vi.fn(async () => ({ success: false })),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: (...a: unknown[]) => toastMock(...a) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/estoque/recebimento',
  useSearchParams: () => new URLSearchParams(),
}))

const { RecebimentoGerentePageClient } = await import('./RecebimentoGerentePageClient')
const { AdminV2SessionProvider } = await import('@/components/ui/admin-v2/AdminV2SessionContext')

const P1 = { id: 'p1', nome: 'Produto A', codigo_barras: null }
const P2 = { id: 'p2', nome: 'Produto B', codigo_barras: null }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  criarRemessaMock.mockReset()
  buscarMock.mockReset()
  toastMock.mockReset()
  buscarMock.mockResolvedValue({ success: true, data: [P2] })
  criarRemessaMock.mockResolvedValue({ success: true, data: { remessaId: 'rem-12345678', oc: null, saldoAtual: null } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

async function renderizar() {
  await act(async () => {
    root.render(
      <AdminV2SessionProvider idioma="pt">
        <RecebimentoGerentePageClient idioma="pt" temProdutos remessasRecentes={[]} embeddedInAdminHub produtoPreSelecionado={P1} />
      </AdminV2SessionProvider>,
    )
  })
}

function definirValor(input: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const form = () => container.querySelector('#recebimento-form') as HTMLFormElement
const botao = (txt: string) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === txt) as HTMLButtonElement

async function escolherProdutoExtra() {
  const combos = Array.from(container.querySelectorAll('input[role="combobox"]')) as HTMLInputElement[]
  const busca = combos.at(-1)!
  act(() => {
    busca.dispatchEvent(new Event('focus', { bubbles: true }))
    definirValor(busca, 'Produto B')
  })
  await act(async () => {
    vi.advanceTimersByTime(400)
    await Promise.resolve()
    await Promise.resolve()
  })
  const opcao = container.querySelector('button[role="option"]') as HTMLButtonElement
  await act(async () => {
    opcao.click()
    await Promise.resolve()
  })
}

describe('Recebimento — vários produtos na mesma entrada (UX-018)', () => {
  it('"Sem documento": envia os dois produtos numa única chamada e mostra "2 produtos creditados"', async () => {
    await renderizar()
    await act(async () => botao('+ Adicionar outro produto').click())
    await escolherProdutoExtra()
    const qtdExtra = container.querySelector('[data-testid="rec-itens-extra"] input[type="number"]') as HTMLInputElement
    await act(async () => {
      definirValor(form().querySelector('input[name="origem"]') as HTMLInputElement, 'Entrega avulsa')
      definirValor(form().querySelector('input[name="qtd_conferida"]') as HTMLInputElement, '10')
      definirValor(qtdExtra, '4')
    })
    await act(async () => {
      form().requestSubmit()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(criarRemessaMock).toHaveBeenCalledTimes(1)
    const arg = criarRemessaMock.mock.calls[0][0]
    expect(arg.itens).toEqual([
      { produto_id: 'p1', quantidade_conferida: 10 },
      { produto_id: 'p2', quantidade_conferida: 4 },
    ])
    expect(container.textContent).toContain('2 produtos creditados')
  })

  it('linha extra totalmente em branco é ignorada (continua enviando 1 item)', async () => {
    await renderizar()
    await act(async () => botao('+ Adicionar outro produto').click())
    await act(async () => {
      definirValor(form().querySelector('input[name="origem"]') as HTMLInputElement, 'Entrega')
      definirValor(form().querySelector('input[name="qtd_conferida"]') as HTMLInputElement, '3')
    })
    await act(async () => {
      form().requestSubmit()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(criarRemessaMock.mock.calls[0][0].itens).toEqual([{ produto_id: 'p1', quantidade_conferida: 3 }])
  })

  it('linha extra incompleta (quantidade sem produto) recusa o envio', async () => {
    await renderizar()
    await act(async () => botao('+ Adicionar outro produto').click())
    const qtdExtra = container.querySelector('[data-testid="rec-itens-extra"] input[type="number"]') as HTMLInputElement
    await act(async () => {
      definirValor(form().querySelector('input[name="origem"]') as HTMLInputElement, 'Entrega')
      definirValor(form().querySelector('input[name="qtd_conferida"]') as HTMLInputElement, '3')
      definirValor(qtdExtra, '2')
    })
    await act(async () => {
      form().requestSubmit()
    })
    expect(criarRemessaMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }))
  })

  it('remover a linha extra e trocar para "Ordem de Compra" esconde a lista (pedido = um item por vez)', async () => {
    await renderizar()
    await act(async () => botao('+ Adicionar outro produto').click())
    expect(container.querySelectorAll('[data-testid="rec-itens-extra"] input[type="number"]')).toHaveLength(1)
    await act(async () => botao('Remover').click())
    expect(container.querySelectorAll('[data-testid="rec-itens-extra"] input[type="number"]')).toHaveLength(0)
    await act(async () => botao('Ordem de Compra').click())
    expect(container.querySelector('[data-testid="rec-itens-extra"]')).toBeNull()
  })
})
