/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComissoesLabels } from './comissoesLabels'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const carregarDetalheMock = vi.fn()
const marcarPagasMock = vi.fn()
const routerRefreshMock = vi.fn()
const emitGerenteToastMock = vi.fn()

vi.mock('@/app/gerente/comissoes/actions', () => ({
  carregarDetalheComissoes: (...args: unknown[]) => carregarDetalheMock(...args),
  marcarComissoesPagas: (...args: unknown[]) => marcarPagasMock(...args),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: (...args: unknown[]) => emitGerenteToastMock(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}))

import { ComissoesContent } from './ComissoesContent'

const LABELS: ComissoesLabels = {
  colOperador: 'Operador',
  colVendas: 'Vendas',
  colTotal: 'Total',
  colPago: 'Pago',
  colPendente: 'Pendente',
  colAcoes: 'Ações',
  verDetalhes: 'Detalhes',
  operadoresTitulo: 'Operadores ({{n}})',
  periodoLabel: 'Período',
  aSeparator: ' a ',
  statusLabel: 'Status',
  statusTodos: 'Todos',
  statusPendente: 'Pendente',
  statusPago: 'Pago',
  vazioComissoes: 'Nenhuma comissão encontrada neste período',
  vazioComissoesSub: 'Ajuste o período ou o status nos filtros acima.',
  vazioCta: 'Alterar período',
  emPendenciaSuffix: 'em pendência',
  fecharDetalhe: 'Fechar detalhe',
  metricTotal: 'Total',
  metricPago: 'Pago',
  metricPendente: 'Pendente',
  carregando: 'Carregando detalhe…',
  desselecionarTodas: 'Desselecionar todas',
  selecionarPendentes: 'Selecionar pendentes',
  selecionarItem: 'Selecionar comissão da venda',
  marcarComoPagoBtn: 'Marcar {{n}} como pago ({{valor}})',
  marcadoSucesso: 'Comissões marcadas como pagas.',
  vendaPrefix: 'Venda:',
  semComissoes: 'Sem comissões neste período',
  erroPagarFallback: 'Erro ao marcar como pago',
  locale: 'pt-BR',
}

let container: HTMLDivElement
let root: Root

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui)
  })
}

beforeEach(() => {
  carregarDetalheMock.mockReset()
  marcarPagasMock.mockReset()
  routerRefreshMock.mockReset()
  emitGerenteToastMock.mockReset()
  carregarDetalheMock.mockResolvedValue({ success: true, data: [] })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

describe('ComissoesContent', () => {
  it('mostra empty state com CTA quando não há operadores', () => {
    render(
      <ComissoesContent
        dados={[]}
        filtroInicial={{ de: '2026-07-10', ate: '2026-08-09', status: 'todos' }}
        labels={LABELS}
      />,
    )

    expect(container.textContent).toContain('Nenhuma comissão encontrada neste período')
    expect(container.textContent).toContain('Alterar período')
    expect(container.textContent).toContain('Total')
    expect(container.textContent).toContain('Pendente')
  })

  it('abre sheet de detalhe ao clicar em Detalhes', async () => {
    render(
      <ComissoesContent
        dados={[
          {
            operador_id: 'op-1',
            operador_nome: 'Ana',
            total_vendas: 2,
            total_comissao: 30,
            total_pago: 10,
            total_pendente: 20,
          },
        ]}
        filtroInicial={{ de: '2026-07-10', ate: '2026-08-09', status: 'todos' }}
        labels={LABELS}
      />,
    )

    const btn = Array.from(container.querySelectorAll('button')).find(
      (el) => el.textContent === 'Detalhes',
    )
    expect(btn).toBeTruthy()

    await act(async () => {
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(carregarDetalheMock).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.textContent).toContain('Ana')
  })
})
