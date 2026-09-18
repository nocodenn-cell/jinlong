/** @vitest-environment jsdom */
/**
 * BP-F1 — o campo "Vincular a uma Ordem de Compra" do recebimento manual só
 * VALIDA (recusa pedido já recebido); a RPC não recebe o id do pedido e o
 * pedido não muda de estado. O texto de ajuda precisa dizer isso, senão o
 * operador acredita ter dado baixa no pedido.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./actions', () => ({
  criarRemessaConferencia: vi.fn(),
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

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function renderizar(idioma: 'pt' | 'zh' = 'pt') {
  await act(async () => {
    root.render(
      <AdminV2SessionProvider idioma={idioma}>
        <RecebimentoGerentePageClient
          idioma={idioma}
          produtos={[{ id: 'p1', nome: 'Produto A', codigo_barras: null }]}
          remessasRecentes={[]}
          embeddedInAdminHub
        />
      </AdminV2SessionProvider>,
    )
  })
}

describe('RecebimentoGerentePageClient — ajuda do vínculo com a Ordem de Compra (BP-F1)', () => {
  it('pt: explica que o vínculo não dá baixa no pedido e que ele pode ser recebido de novo', async () => {
    await renderizar('pt')

    const hint = container.querySelector('#rec-oc-hint')
    expect(hint).toBeTruthy()
    expect(hint?.textContent).toContain('Ele não dá baixa no pedido')
    expect(hint?.textContent).toContain('duplicaria o estoque')
  })

  it('zh: a mesma ajuda existe (sem chave faltando)', async () => {
    await renderizar('zh')

    const hint = container.querySelector('#rec-oc-hint')
    expect(hint).toBeTruthy()
    expect((hint?.textContent ?? '').length).toBeGreaterThan(10)
    expect(hint?.textContent).not.toContain('undefined')
  })
})
