/** @vitest-environment jsdom */
/**
 * BP-F1 / UX-04 — lançar a mesma mercadoria por outro caminho SEM escolher este pedido credita o
 * estoque duas vezes (o pedido só sabe do que foi vinculado a ele). O modal do pedido em trânsito
 * com saldo a receber avisa isso; pedido sem saldo ou fora de trânsito não tem o que avisar.
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
  encerrarOrdemCompraComFalta: vi.fn(),
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
    total_itens: 1,
    valor_total: 50,
    pedido_total: 10,
    recebido_total: status === 'RECEBIDA' ? 10 : 0,
    pendente_total: status === 'RECEBIDA' ? 0 : 10,
    encerrada_com_falta: false,
    encerramento_motivo: null,
    entradas: [],
    itens: [
      {
        id: 'it-1',
        produto_id: 'p-1',
        produto_nome: 'Produto A',
        descricao: null,
        quantidade: 10,
        preco_unitario: 5,
        quantidade_recebida: status === 'RECEBIDA' ? 10 : 0,
        saldo_pendente: status === 'RECEBIDA' ? 0 : 10,
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
  it.each(['EM_TRANSITO', 'CONFIRMADA'])('pedido %s: avisa que o mesmo lançamento por outro caminho credita o estoque duas vezes', async (status) => {
    await abrir(status)

    const aviso = container.querySelector('[data-testid="oc-aviso-recebimento-duplicidade"]')
    expect(aviso).toBeTruthy()
    expect(aviso?.textContent).toContain('Registre a entrega em Entradas')
    expect(aviso?.textContent).toContain('sem lançar estoque novamente')
    expect(container.textContent).toContain('Receber em Entradas')
  })

  it.each(['RASCUNHO', 'RECEBIDA', 'CANCELADA'])(
    'pedido %s: não mostra o aviso (não há recebimento a registrar)',
    async (status) => {
      await abrir(status)

      expect(container.querySelector('[data-testid="oc-aviso-recebimento-duplicidade"]')).toBeNull()
    },
  )
})
