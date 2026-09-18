/** @vitest-environment jsdom */
/**
 * Recebimento manual ("Entrada sem nota") — comportamento do formulário.
 *
 * (1) BP-F1: o campo "Vincular a uma Ordem de Compra" só VALIDA (recusa pedido
 *     já recebido); a RPC não recebe o id do pedido e o pedido não muda de
 *     estado. O texto de ajuda precisa dizer isso, senão o operador acredita
 *     ter dado baixa no pedido.
 * (2) A1: depois de confirmar a entrada o formulário volta ao estado inicial.
 *     Com os campos preenchidos e uma nova chave de idempotência, um segundo
 *     clique criava outra entrada (e outro crédito de estoque).
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const criarRemessaMock = vi.fn()

vi.mock('./actions', () => ({
  criarRemessaConferencia: (...a: unknown[]) => criarRemessaMock(...a),
  buscarProdutosRecebimento: vi.fn(async () => ({ success: true, data: [] })),
}))
vi.mock('../compras/actions', () => ({
  listarOrdensCompraElegiveisParaVinculo: vi.fn(async () => []),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/estoque/recebimento',
  useSearchParams: () => new URLSearchParams(),
}))

const { RecebimentoGerentePageClient } = await import('./RecebimentoGerentePageClient')
const { AdminV2SessionProvider } = await import('@/components/ui/admin-v2/AdminV2SessionContext')

const PRODUTO = { id: 'p1', nome: 'Produto A', codigo_barras: null }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  criarRemessaMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function renderizar(opts: { idioma?: 'pt' | 'zh'; preSelecionado?: boolean } = {}) {
  const idioma = opts.idioma ?? 'pt'
  await act(async () => {
    root.render(
      <AdminV2SessionProvider idioma={idioma}>
        <RecebimentoGerentePageClient
          idioma={idioma}
          produtos={[PRODUTO]}
          remessasRecentes={[]}
          embeddedInAdminHub
          produtoPreSelecionado={opts.preSelecionado ? PRODUTO : null}
        />
      </AdminV2SessionProvider>,
    )
  })
}

function definirValor(input: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function form(): HTMLFormElement {
  return container.querySelector('#recebimento-form') as HTMLFormElement
}

function campo(nome: string): HTMLInputElement {
  return form().querySelector(`input[name="${nome}"]`) as HTMLInputElement
}

describe('RecebimentoGerentePageClient — ajuda do vínculo com a Ordem de Compra (BP-F1)', () => {
  it('pt: explica que o vínculo não dá baixa no pedido e que ele pode ser recebido de novo', async () => {
    await renderizar({ idioma: 'pt' })

    const hint = container.querySelector('#rec-oc-hint')
    expect(hint).toBeTruthy()
    expect(hint?.textContent).toContain('Ele não dá baixa no pedido')
    expect(hint?.textContent).toContain('duplicaria o estoque')
  })

  it('zh: a mesma ajuda existe (sem chave faltando)', async () => {
    await renderizar({ idioma: 'zh' })

    const hint = container.querySelector('#rec-oc-hint')
    expect(hint).toBeTruthy()
    expect((hint?.textContent ?? '').length).toBeGreaterThan(10)
    expect(hint?.textContent).not.toContain('undefined')
  })
})

describe('RecebimentoGerentePageClient — formulário limpo após confirmar a entrada (A1)', () => {
  it('confirma, limpa todos os campos (inclusive o produto) e um novo envio imediato não cria outra entrada', async () => {
    criarRemessaMock.mockResolvedValue({ success: true, data: 'rem-12345678' })
    await renderizar({ preSelecionado: true })

    expect(campo('produto_id').value).toBe('p1')
    await act(async () => {
      definirValor(campo('origem'), 'Entrega do fornecedor X')
      definirValor(campo('qtd_esperada'), '10')
      definirValor(campo('qtd_conferida'), '10')
    })
    await act(async () => {
      form().requestSubmit()
    })

    expect(criarRemessaMock).toHaveBeenCalledTimes(1)
    expect(criarRemessaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        origem: 'Entrega do fornecedor X',
        itens: [{ produto_id: 'p1', quantidade_esperada: 10, quantidade_conferida: 10 }],
      }),
    )

    expect(campo('origem').value).toBe('')
    expect(campo('qtd_esperada').value).toBe('')
    expect(campo('qtd_conferida').value).toBe('')
    expect(campo('produto_id').value).toBe('')

    await act(async () => {
      form().requestSubmit()
    })
    expect(criarRemessaMock).toHaveBeenCalledTimes(1)
  })

  it('falha ao confirmar: mantém o que o operador digitou (nada de perder o preenchimento)', async () => {
    criarRemessaMock.mockResolvedValue({ success: false, error: 'Falha de rede.' })
    await renderizar({ preSelecionado: true })

    await act(async () => {
      definirValor(campo('origem'), 'Entrega do fornecedor X')
      definirValor(campo('qtd_esperada'), '10')
      definirValor(campo('qtd_conferida'), '10')
    })
    await act(async () => {
      form().requestSubmit()
    })

    expect(criarRemessaMock).toHaveBeenCalledTimes(1)
    expect(campo('origem').value).toBe('Entrega do fornecedor X')
    expect(campo('qtd_esperada').value).toBe('10')
    expect(campo('produto_id').value).toBe('p1')
  })
})
