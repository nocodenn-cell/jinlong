/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  usePathname: () => '/admin/comissoes',
}))

vi.mock('@/app/gerente/comissoes/actions', () => ({
  carregarDetalheComissoes: vi.fn(),
  marcarComissoesPagas: vi.fn(),
}))

import { ComissoesContent, type ComissoesLabels } from './ComissoesContent'

const LABELS: ComissoesLabels = {
  colOperador: 'Operador', colVendas: 'Vendas', colTotal: 'Total', colPago: 'Pago', colPendente: 'Pendente',
  operadoresTitulo: 'Operadores ({{n}})', periodoLabel: 'Período', aSeparator: ' a ',
  statusLabel: 'Status', statusTodos: 'todos', statusPendente: 'Pendente', statusPago: 'Pago',
  vazioComissoes: 'Nenhuma comissão', emPendenciaSuffix: 'em pendência', fecharDetalhe: 'Fechar',
  metricTotal: 'Total', metricPago: 'Pago', metricPendente: 'Pendente', carregando: 'Carregando…',
  desselecionarTodas: 'Desselecionar todas', selecionarPendentes: 'Selecionar pendentes',
  marcarComoPagoBtn: 'Marcar {{n}} como pago ({{valor}})', vendaPrefix: 'Venda:', semComissoes: 'Sem comissões',
  erroPagarFallback: 'Erro ao marcar como pago',
  filtroDe: 'De', filtroAte: 'Até', filtrar: 'Filtrar', limparFiltros: 'Limpar filtros',
  locale: 'pt-BR',
}

const ROW = { operador_id: 'op-1', operador_nome: 'João', total_vendas: 5, total_comissao: 100, total_pago: 60, total_pendente: 40 }

let container: HTMLDivElement
let root: Root

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui)
  })
}

beforeEach(() => {
  pushMock.mockClear()
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

describe('ComissoesContent — loadError honesto', () => {
  it('mostra o alerta de falha real quando loadError está presente', () => {
    render(
      <ComissoesContent
        dados={[]}
        loadError="Não foi possível carregar as comissões."
        filtroInicial={{ de: '2026-06-01', ate: '2026-07-01', status: 'todos' }}
        labels={LABELS}
      />,
    )
    const alerta = container.querySelector('[role="alert"]')
    expect(alerta).not.toBeNull()
    expect(alerta?.textContent).toContain('Não foi possível carregar')
  })

  it('sem loadError, não mostra o alerta de falha', () => {
    render(
      <ComissoesContent
        dados={[ROW]}
        loadError={null}
        filtroInicial={{ de: '2026-06-01', ate: '2026-07-01', status: 'todos' }}
        labels={LABELS}
      />,
    )
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})

describe('ComissoesContent — filtros reais (não mais texto read-only)', () => {
  it('renderiza inputs reais de data e um select de status, não apenas texto', () => {
    render(
      <ComissoesContent
        dados={[ROW]}
        loadError={null}
        filtroInicial={{ de: '2026-06-01', ate: '2026-07-01', status: 'todos' }}
        labels={LABELS}
      />,
    )
    const inputsData = container.querySelectorAll('input[type="date"]')
    expect(inputsData.length).toBe(2)
    expect(container.querySelector('select')).not.toBeNull()
  })

  it('trocar o status dispara navegação via router.push com o novo filtro', () => {
    render(
      <ComissoesContent
        dados={[ROW]}
        loadError={null}
        filtroInicial={{ de: '2026-06-01', ate: '2026-07-01', status: 'todos' }}
        labels={LABELS}
      />,
    )
    const select = container.querySelector('select') as HTMLSelectElement
    act(() => {
      select.value = 'pendente'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(pushMock).toHaveBeenCalledWith('/admin/comissoes?de=2026-06-01&ate=2026-07-01&status=pendente')
  })

  it('botão Filtrar aplica o período editado nos inputs de data', () => {
    render(
      <ComissoesContent
        dados={[ROW]}
        loadError={null}
        filtroInicial={{ de: '2026-06-01', ate: '2026-07-01', status: 'todos' }}
        labels={LABELS}
      />,
    )
    const [inputDe] = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[]
    // Inputs controlados por React interceptam o setter nativo de `.value` —
    // atribuir diretamente não dispara o onChange. Usa o setter nativo do
    // protótipo para simular digitação real (técnica padrão de testes RTL).
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      nativeSetter.call(inputDe, '2026-05-01')
      inputDe.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const botaoFiltrar = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Filtrar') as HTMLButtonElement
    act(() => {
      botaoFiltrar.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(pushMock).toHaveBeenCalledWith('/admin/comissoes?de=2026-05-01&ate=2026-07-01')
  })
})
