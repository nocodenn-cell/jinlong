/** @vitest-environment jsdom */
/**
 * BP-F1 — o recebimento pelo pedido, a "Entrada sem nota" e a NF-e creditam
 * estoque de forma independente e nada os liga. Enquanto a decisão de produto
 * sobre o vínculo não sai, o modal do pedido em trânsito avisa que lançar a mesma
 * mercadoria por outro caminho credita o estoque duas vezes.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const obterDetalheMock = vi.fn()

vi.mock('./actions', () => ({
  obterOrdemCompraDetalhe: (id: string) => obterDetalheMock(id),
  atualizarStatusOC: vi.fn(),
  registrarRecebimentoOC: vi.fn(),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))

const { OcDetalheModal } = await import('./OcDetalheModal')

function ocComStatus(status: string) {
  return {
    id: 'oc-1234567890',
    fornecedor_id: 'f1',
    fornecedor_nome: 'Fornecedor Alfa',
    status,
    data_emissao: '2026-09-01',
    data_prevista_chegada: null,
    observacao: null,
    created_at: '2026-09-01T00:00:00Z',
    itens: [
      {
        id: 'it-1',
        produto_id: 'p-1',
        produto_nome: 'Produto A',
        descricao: null,
        quantidade: 10,
        preco_unitario: 5,
        quantidade_recebida: 0,
        unidade_medida: 'UN',
      },
    ],
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  obterDetalheMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function abrir(status: string) {
  obterDetalheMock.mockResolvedValue({ success: true, data: ocComStatus(status) })
  await act(async () => {
    root.render(
      <OcDetalheModal
        idioma="pt"
        ocId="oc-1234567890"
        onClose={() => {}}
        onEditar={() => {}}
        onStatusChanged={() => {}}
      />,
    )
  })
}

describe('OcDetalheModal — aviso de duplicidade no recebimento (BP-F1)', () => {
  it('pedido em trânsito: avisa que o mesmo lançamento por outro caminho credita o estoque duas vezes', async () => {
    await abrir('EM_TRANSITO')

    const aviso = container.querySelector('[data-testid="oc-aviso-recebimento-duplicidade"]')
    expect(aviso).toBeTruthy()
    expect(aviso?.textContent).toContain('credita o estoque agora')
    expect(aviso?.textContent).toContain('creditado duas vezes')
    expect(container.textContent).toContain('Registrar recebimento')
  })

  it.each(['RASCUNHO', 'CONFIRMADA', 'RECEBIDA', 'CANCELADA'])(
    'pedido %s: não mostra o aviso (não há recebimento a registrar)',
    async (status) => {
      await abrir(status)

      expect(container.querySelector('[data-testid="oc-aviso-recebimento-duplicidade"]')).toBeNull()
    },
  )
})
