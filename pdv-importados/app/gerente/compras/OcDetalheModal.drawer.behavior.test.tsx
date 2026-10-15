/** @vitest-environment jsdom */
/**
 * Roadmap UX, Tarefa 9 — o detalhe da ordem de compra abre na gaveta do DragonModal
 * (640 px no desktop, tela cheia no mobile), com as ações do pedido no footer fixo.
 * O ESC mantém os dois níveis: com a confirmação de cancelar/encerrar aberta, o primeiro
 * ESC só sai dela; sem confirmação, fecha a gaveta. As regras do pedido não mudam.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const obterDetalheMock = vi.fn()
const receberMock = vi.fn()
const encerrarMock = vi.fn()
const statusMock = vi.fn()
const toastMock = vi.fn()

vi.mock('./actions', () => ({
  obterOrdemCompraDetalhe: (id: string) => obterDetalheMock(id),
  atualizarStatusOC: (...a: unknown[]) => statusMock(...a),
  registrarRecebimentoOC: (...a: unknown[]) => receberMock(...a),
  encerrarOrdemCompraComFalta: (...a: unknown[]) => encerrarMock(...a),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: (...a: unknown[]) => toastMock(...a) }))

const { OcDetalheModal } = await import('./OcDetalheModal')

const OC_ID = 'oc-1234567890'

type Over = {
  status?: string
  recebida?: number
  quantidade?: number
  encerrada_com_falta?: boolean
  motivo?: string | null
  entradas?: unknown[]
}

function oc(o: Over = {}) {
  const quantidade = o.quantidade ?? 100
  const recebida = o.recebida ?? 0
  const pendente = Math.max(quantidade - recebida, 0)
  return {
    id: OC_ID,
    fornecedor_id: 'f1',
    fornecedor_nome: 'Fornecedor Alfa',
    status: o.status ?? 'EM_TRANSITO',
    data_emissao: '2026-09-01',
    data_prevista_chegada: null,
    observacao: null,
    created_at: '2026-09-01T00:00:00Z',
    total_itens: 1,
    valor_total: quantidade * 3,
    pedido_total: quantidade,
    recebido_total: recebida,
    pendente_total: pendente,
    encerrada_com_falta: o.encerrada_com_falta ?? false,
    encerramento_motivo: o.motivo ?? null,
    itens: [
      {
        id: 'it-1',
        produto_id: 'p-1',
        produto_nome: 'Produto A',
        descricao: null,
        quantidade,
        preco_unitario: 3,
        quantidade_recebida: recebida,
        saldo_pendente: pendente,
        unidade_medida: 'UN',
      },
    ],
    entradas: o.entradas ?? [],
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  onClose.mockReset()
  onEditar.mockReset()
  obterDetalheMock.mockReset()
  receberMock.mockReset()
  encerrarMock.mockReset()
  statusMock.mockReset()
  toastMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.style.overflow = ''
})

const onClose = vi.fn()
const onEditar = vi.fn()

async function abrir(o: Over = {}, onStatusChanged: () => void = () => {}) {
  obterDetalheMock.mockResolvedValue({ success: true, data: oc(o) })
  await act(async () => {
    root.render(
      <OcDetalheModal
        idioma="pt"
        ocId={OC_ID}
        onClose={onClose}
        onEditar={onEditar}
        onStatusChanged={onStatusChanged}
      />,
    )
  })
}


const c = getMessages('pt').compras
const gaveta = () => container.querySelector('[role="dialog"][data-placement="drawer"]') as HTMLElement
const footer = () => gaveta().querySelector('[data-dragon-footer]') as HTMLElement
const botao = (raiz: ParentNode, texto: string) =>
  Array.from(raiz.querySelectorAll('button')).find((b) => b.textContent?.trim() === texto)
const esc = () =>
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  })

describe('OcDetalheModal — gaveta (Tarefa 9)', () => {
  it('abre como gaveta larga (640 px) com o título da ordem', async () => {
    await abrir({ status: 'RASCUNHO' })
    expect(gaveta()).not.toBeNull()
    const painel = gaveta().querySelector('[data-dragon-panel]') as HTMLElement
    expect(painel.classList.contains('sm:max-w-[640px]')).toBe(true)
    expect(document.getElementById(gaveta().getAttribute('aria-labelledby')!)?.textContent).toBe(
      c.modal_detalhe_titulo,
    )
  })

  it('ações do pedido (inclusive Editar) ficam no footer fixo', async () => {
    await abrir({ status: 'RASCUNHO' })
    expect(botao(footer(), c.btn_confirmar_oc)).toBeDefined()
    expect(botao(footer(), c.btn_cancelar_oc)).toBeDefined()
    const editar = botao(footer(), c.btn_editar)
    expect(editar).toBeDefined()
    act(() => editar!.click())
    expect(onEditar).toHaveBeenCalledTimes(1)
  })

  it('em trânsito, "Receber em Entradas" fica no footer', async () => {
    await abrir({ status: 'EM_TRANSITO', recebida: 0 })
    expect(footer().querySelector('[data-testid="oc-btn-registrar-recebimento"]')).not.toBeNull()
  })

  it('ESC fecha a gaveta quando não há confirmação aberta; o X também', async () => {
    await abrir({ status: 'RASCUNHO' })
    esc()
    expect(onClose).toHaveBeenCalledTimes(1)
    act(() => (gaveta().querySelector('button[aria-label="Fechar"]') as HTMLButtonElement).click())
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('com a confirmação de cancelamento aberta, o primeiro ESC só sai dela', async () => {
    await abrir({ status: 'RASCUNHO' })
    act(() => botao(footer(), c.btn_cancelar_oc)!.click())
    expect(botao(footer(), c.btn_cancelar_oc)).toBeUndefined() // em confirmação
    esc()
    expect(onClose).not.toHaveBeenCalled()
    expect(botao(footer(), c.btn_cancelar_oc)).toBeDefined() // saiu da confirmação
    esc()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
