/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AjusteComissao, ComissaoDetalheRow, ComissaoResumoRow, LiquidacaoResultado } from '@/app/gerente/comissoes/actions'
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
  colBruto: 'Bruto',
  colAjustes: 'Ajustes',
  colLiquidoPago: 'Líquido pago',
  colSaldoResidual: 'Saldo a compensar',
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
  saldoResidualSuffix: 'a compensar',
  fecharDetalhe: 'Fechar detalhe',
  metricBruto: 'Comissão bruta apurada',
  metricAjustes: 'Ajustes lançados',
  metricLiquidoPago: 'Líquido pago',
  metricSaldoResidual: 'Saldo a compensar',
  carregando: 'Carregando detalhe…',
  desselecionarTodas: 'Desselecionar todas',
  selecionarPendentes: 'Selecionar pendentes',
  selecionarItem: 'Selecionar comissão da venda',
  marcarComoPagoBtn: 'Marcar {{n}} como pago ({{valor}} bruto)',
  marcadoSucesso: 'Liquidação registrada.',
  vendaPrefix: 'Venda:',
  semComissoes: 'Sem comissões neste período',
  erroPagarFallback: 'Erro ao liquidar comissões',
  locale: 'pt-BR',
  detalheOriginal: 'Comissão original',
  detalheAjustado: 'Ajustado',
  detalheLiquidoApurado: 'Líquido apurado',
  detalhePago: 'Pago',
  detalheSaldo: 'Saldo',
  ajustesTitulo: 'Ajustes desta comissão',
  ajustesVazio: 'Nenhum ajuste — comissão original intacta.',
  ajusteConsumido: 'consumido',
  ajustePendente: 'pendente',
  ajusteOrigemVenda: 'cancelamento da venda',
  ajusteOrigemPosVenda: 'operação pós-venda',
  tipoCancelamento: 'Cancelamento',
  tipoDevolucao: 'Devolução',
  tipoTroca: 'Troca',
  liquidacaoTitulo: 'Liquidação registrada',
  liquidacaoBruto: 'Valor bruto',
  liquidacaoCompensado: 'Compensado com ajustes',
  liquidacaoLiquido: 'Líquido efetivamente pago',
  liquidacaoPagamentoId: 'Pagamento',
  liquidacaoReplay: 'Este lote já havia sido liquidado — nenhum novo pagamento foi criado.',
  liquidacaoFechar: 'Fechar',
}

const OPERADOR: ComissaoResumoRow = {
  operadorId: 'op-1',
  operadorNome: 'Ana',
  totalVendas: 4,
  totalComissaoBruta: 100,
  totalAjustes: 25,
  totalLiquidoPago: 60,
  totalSaldoResidual: 15,
}

function ajuste(overrides: Partial<AjusteComissao> = {}): AjusteComissao {
  return {
    ajusteId: 'aj-1',
    tipo: 'DEVOLUCAO',
    valor: 10,
    atorId: 'user-1',
    origemTipo: 'OPERACAO_POS_VENDA',
    origemOcorridaEm: '2026-08-01T10:00:00Z',
    vendaSubstitutaId: null,
    createdAt: '2026-08-01T10:00:00Z',
    valorConsumido: 10,
    valorPendente: 0,
    ...overrides,
  }
}

function comissao(overrides: Partial<ComissaoDetalheRow> = {}): ComissaoDetalheRow {
  return {
    comissaoId: 'com-1',
    vendaId: 'venda-aaaaaaaa-1111',
    baseCalculo: 200,
    status: 'pendente',
    createdAt: '2026-08-01T10:00:00Z',
    valorOriginal: 10,
    valorAjustado: 0,
    valorCompensado: 0,
    valorLiquidoApurado: 10,
    valorPago: null,
    pagamentoId: null,
    pagoEm: null,
    saldoFinal: 10,
    ajustes: [],
    ...overrides,
  }
}

let container: HTMLDivElement
let root: Root

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui)
  })
}

async function abrirDetalhesDeAna() {
  const btn = Array.from(container.querySelectorAll('button')).find((el) => el.textContent === 'Ana')
  expect(btn).toBeTruthy()
  await act(async () => {
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
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

describe('ComissoesContent — KPIs e semântica líquida', () => {
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
  })

  it('os 4 KPIs exibidos são exatamente os valores devolvidos pelo backend, sem recalcular', () => {
    render(
      <ComissoesContent
        dados={[OPERADOR]}
        filtroInicial={{ de: '2026-07-10', ate: '2026-08-09', status: 'todos' }}
        labels={LABELS}
      />,
    )

    // bruto=100, ajustes=25 (exibido com sinal negativo), líquido pago=60, saldo=15
    expect(container.textContent).toMatch(/R\$\s?100,00/)
    expect(container.textContent).toMatch(/R\$\s?60,00/)
    expect(container.textContent).toMatch(/R\$\s?15,00/)
    // ajustes aparecem com sinal negativo — não confundir com o bruto
    expect(container.textContent).toMatch(/−R\$\s?25,00/)
  })

  it('abre sheet de detalhe ao clicar no operador', async () => {
    render(
      <ComissoesContent
        dados={[OPERADOR]}
        filtroInicial={{ de: '2026-07-10', ate: '2026-08-09', status: 'todos' }}
        labels={LABELS}
      />,
    )

    await abrirDetalhesDeAna()

    expect(carregarDetalheMock).toHaveBeenCalledWith('op-1', { de: '2026-07-10', ate: '2026-08-09', status: 'todos' })
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  })
})

describe('ComissoesContent — cenários de ajuste (P1: auditoria/detalhe)', () => {
  it('comissão SEM ajuste: nenhum badge de ajuste, líquido apurado == original', async () => {
    carregarDetalheMock.mockResolvedValue({
      success: true,
      data: [comissao({ valorOriginal: 20, valorAjustado: 0, valorLiquidoApurado: 20, saldoFinal: 20, ajustes: [] })],
    })

    render(<ComissoesContent dados={[OPERADOR]} filtroInicial={{ de: '2026-07-10', ate: '2026-08-09', status: 'todos' }} labels={LABELS} />)
    await abrirDetalhesDeAna()

    expect(container.textContent).toContain('Nenhum ajuste — comissão original intacta.')
    expect(container.textContent).not.toContain('Cancelamento')
    expect(container.textContent).not.toContain('Devolução')
    expect(container.textContent).not.toContain('Troca')
  })

  it('comissão com DEVOLUÇÃO parcial: tipo distinguível, ajuste < original', async () => {
    carregarDetalheMock.mockResolvedValue({
      success: true,
      data: [
        comissao({
          valorOriginal: 20,
          valorAjustado: 8,
          valorCompensado: 8,
          valorLiquidoApurado: 12,
          saldoFinal: 12,
          ajustes: [ajuste({ tipo: 'DEVOLUCAO', valor: 8, valorConsumido: 8, valorPendente: 0 })],
        }),
      ],
    })

    render(<ComissoesContent dados={[OPERADOR]} filtroInicial={{ de: '2026-07-10', ate: '2026-08-09', status: 'todos' }} labels={LABELS} />)
    await abrirDetalhesDeAna()

    expect(container.textContent).toContain('Devolução')
    expect(container.textContent).toContain('operação pós-venda')
    expect(container.textContent).toMatch(/−R\$\s?8,00/)
  })

  it('comissão TOTALMENTE compensada (CANCELAMENTO): ajuste == original, líquido apurado = 0', async () => {
    carregarDetalheMock.mockResolvedValue({
      success: true,
      data: [
        comissao({
          valorOriginal: 15,
          valorAjustado: 15,
          valorCompensado: 15,
          valorLiquidoApurado: 0,
          saldoFinal: 0,
          ajustes: [ajuste({ tipo: 'CANCELAMENTO', valor: 15, origemTipo: 'VENDA', valorConsumido: 15, valorPendente: 0 })],
        }),
      ],
    })

    render(<ComissoesContent dados={[OPERADOR]} filtroInicial={{ de: '2026-07-10', ate: '2026-08-09', status: 'todos' }} labels={LABELS} />)
    await abrirDetalhesDeAna()

    expect(container.textContent).toContain('Cancelamento')
    expect(container.textContent).toContain('cancelamento da venda')
    // saldo/líquido apurado exibidos como zero
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toMatch(/R\$\s?0,00/)
  })

  it('comissão PARCIALMENTE compensada (TROCA): valor_pendente do ajuste > 0', async () => {
    carregarDetalheMock.mockResolvedValue({
      success: true,
      data: [
        comissao({
          valorOriginal: 30,
          valorAjustado: 12,
          valorCompensado: 5,
          valorLiquidoApurado: 18,
          saldoFinal: 18,
          ajustes: [ajuste({ tipo: 'TROCA', valor: 12, valorConsumido: 5, valorPendente: 7 })],
        }),
      ],
    })

    render(<ComissoesContent dados={[OPERADOR]} filtroInicial={{ de: '2026-07-10', ate: '2026-08-09', status: 'todos' }} labels={LABELS} />)
    await abrirDetalhesDeAna()

    expect(container.textContent).toContain('Troca')
    // ajuste com saldo pendente > 0 mostra o rótulo "pendente", não "consumido"
    expect(container.textContent).toContain('pendente')
  })
})

describe('ComissoesContent — liquidação (P0: sem reduzir a {marcadas})', () => {
  it('após liquidar, exibe bruto/compensado/líquido/pagamento retornados pela RPC — não um contador', async () => {
    carregarDetalheMock.mockResolvedValue({
      success: true,
      data: [comissao({ comissaoId: 'com-9', status: 'pendente', valorOriginal: 50, saldoFinal: 50 })],
    })
    const resultado: LiquidacaoResultado = {
      pagamentoId: 'pag-abcdef12-3456',
      valorBruto: 50,
      valorCompensado: 8,
      valorLiquido: 42,
      comissoesPagas: 1,
      idempotentReplay: false,
    }
    marcarPagasMock.mockResolvedValue({ success: true, data: resultado })

    render(<ComissoesContent dados={[OPERADOR]} filtroInicial={{ de: '2026-07-10', ate: '2026-08-09', status: 'todos' }} labels={LABELS} />)
    await abrirDetalhesDeAna()

    const checkbox = container.querySelector('input[type="checkbox"][aria-label*="venda-aa"]') as HTMLInputElement
    expect(checkbox).toBeTruthy()
    await act(async () => {
      checkbox.click()
    })

    const btn = Array.from(container.querySelectorAll('button')).find((el) => el.textContent?.includes('bruto'))
    expect(btn).toBeTruthy()
    await act(async () => {
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(marcarPagasMock).toHaveBeenCalledWith({ operador_id: 'op-1', ids: ['com-9'] })
    // o resultado exibido é EXATAMENTE o que a RPC devolveu: bruto, compensado, líquido, pagamento
    expect(container.textContent).toMatch(/R\$\s?50,00/)
    expect(container.textContent).toMatch(/R\$\s?8,00/)
    expect(container.textContent).toMatch(/R\$\s?42,00/)
    expect(container.textContent).toContain('pag-abcd')
    expect(container.textContent).not.toContain('marcadas')
  })

  it('retry idempotente: idempotentReplay=true é sinalizado ao gerente, não tratado como novo pagamento', async () => {
    carregarDetalheMock.mockResolvedValue({
      success: true,
      data: [comissao({ comissaoId: 'com-9', status: 'pendente' })],
    })
    marcarPagasMock.mockResolvedValue({
      success: true,
      data: {
        pagamentoId: 'pag-replay-0001',
        valorBruto: 50,
        valorCompensado: 8,
        valorLiquido: 42,
        comissoesPagas: 1,
        idempotentReplay: true,
      } satisfies LiquidacaoResultado,
    })

    render(<ComissoesContent dados={[OPERADOR]} filtroInicial={{ de: '2026-07-10', ate: '2026-08-09', status: 'todos' }} labels={LABELS} />)
    await abrirDetalhesDeAna()

    const checkbox = container.querySelector('input[type="checkbox"][aria-label*="venda-aa"]') as HTMLInputElement
    await act(async () => {
      checkbox.click()
    })
    const btn = Array.from(container.querySelectorAll('button')).find((el) => el.textContent?.includes('bruto'))
    await act(async () => {
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('já havia sido liquidado')
  })

  it('envia à action exatamente o conjunto de ids selecionados, independente da ordem de clique (a determinística da chave em si é testada em actions.test.ts)', async () => {
    carregarDetalheMock.mockResolvedValue({
      success: true,
      data: [comissao({ comissaoId: 'com-b' }), comissao({ comissaoId: 'com-a' })],
    })
    marcarPagasMock.mockResolvedValue({
      success: true,
      data: { pagamentoId: 'p1', valorBruto: 20, valorCompensado: 0, valorLiquido: 20, comissoesPagas: 2, idempotentReplay: false },
    })

    render(<ComissoesContent dados={[OPERADOR]} filtroInicial={{ de: '2026-07-10', ate: '2026-08-09', status: 'todos' }} labels={LABELS} />)
    await abrirDetalhesDeAna()

    const boxes = Array.from(container.querySelectorAll('input[type="checkbox"][aria-label*="venda-aa"]')) as HTMLInputElement[]
    for (const box of boxes) {
      await act(async () => {
        box.click()
      })
    }
    const btn = Array.from(container.querySelectorAll('button')).find((el) => el.textContent?.includes('bruto'))
    await act(async () => {
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // ids enviados à action, independente da ordem de seleção na UI
    const call = marcarPagasMock.mock.calls[0][0]
    expect(new Set(call.ids)).toEqual(new Set(['com-a', 'com-b']))
  })
})
