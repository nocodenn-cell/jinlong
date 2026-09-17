/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RelatoriosDados, RelatoriosLabels } from './RelatoriosContent'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  } & Record<string, unknown>) => React.createElement('a', { href, ...rest }, children),
}))

vi.mock('./RelatoriosBarChart', () => ({
  RelatoriosBarChart: () => React.createElement('div', { 'data-testid': 'bar-chart' }),
}))

vi.mock('@/app/admin/dashboard/_components/PaymentDonutChart', () => ({
  PaymentDonutChart: ({ slices }: { slices: Array<{ label: string; value: number }> }) =>
    React.createElement(
      'div',
      { 'data-testid': 'donut' },
      slices.map((s) =>
        React.createElement('span', { key: s.label }, `${s.label}:${s.value}`),
      ),
    ),
}))

// KardexSheet tem sua própria busca de dados (obterKardexProduto) e não é o
// alvo deste teste — só a passagem do alvo certo (RM-04) importa aqui.
vi.mock('@/app/admin/estoque/_components/KardexSheet', () => ({
  KardexSheet: ({ alvo }: { alvo: { produtoId: string; produtoNome: string } | null }) =>
    alvo
      ? React.createElement('div', { 'data-testid': 'kardex-sheet' }, alvo.produtoNome)
      : null,
}))

const { RelatoriosContent } = await import('./RelatoriosContent')
const { AdminV2SessionProvider } = await import('@/components/ui/admin-v2/AdminV2SessionContext')

function renderRelatorios(ui: React.ReactElement) {
  return React.createElement(AdminV2SessionProvider, { idioma: 'pt' }, ui)
}

const labels = {
  titulo: 'Relatórios',
  periodoLabel: 'Período',
  aSeparator: ' a ',
  fusoLabel: 'Fuso {{tz}}',
  avisoDatasInvalidas: 'Datas inválidas',
  avisoPeriodoInvertido: 'Invertido',
  avisoPeriodoLimitado: 'Limitado',
  custoNaoConfiavel: 'Custo não confiável',
  chartFaturamento: 'Faturamento por dia',
  chartStatusVendas: 'Status das vendas',
  labelConcluidas: 'Concluídas',
  labelCanceladas: 'Canceladas',
  kpiFaturamento: 'Faturamento',
  kpiTicket: 'Ticket médio',
  kpiVendas: 'Vendas concluídas',
  kpiCancelamento: 'Cancelamento',
  kpiMargem: 'Margem estimada',
  kpiMargemIndisponivel: 'Indisponível',
  tabVisao: 'Visão geral',
  tabProdutos: 'Produtos',
  tabEstoque: 'Estoque',
  tabMargem: 'Margem e ABC',
  tabVendas: 'Vendas (detalhe)',
  tabsAria: 'Seções',
  secTopProdutos: 'Top produtos',
  secEstoqueReposicao: 'Estoque para reposição',
  linkAbrirEstoque: 'Abrir Estoque',
  minZeroHint: 'mínimo não configurado',
  secMargemPorVenda: 'Margem por venda',
  margemVendaColData: 'Data',
  margemVendaColLiquido: 'Líquido',
  margemVendaColCusto: 'Custo',
  margemVendaColMargem: 'Margem',
  margemVendaCustoIndisponivel: '—',
  vazioMargemVenda: 'Sem margem',
  secCurvaAbc: 'Curva ABC',
  curvaAbcColNome: 'Produto',
  curvaAbcColValor: 'Faturado',
  curvaAbcColAcumulado: 'Acumulado',
  curvaAbcColClasse: 'Classe',
  vazioCurvaAbc: 'Sem ABC',
  secCoberturaEstoque: 'Cobertura',
  coberturaEstoqueHint: 'hint',
  coberturaEstoqueColAtual: 'Saldo',
  coberturaEstoqueColMedia: 'Média/dia',
  coberturaEstoqueColDias: 'dias de cobertura',
  coberturaEstoqueDiasCap: '>{{n}} dias de cobertura',
  vazioCoberturaEstoque: 'Sem cobertura',
  secDivergenciaEstoque: 'Divergência',
  divergenciaEstoqueHint: 'hint divergência',
  divergenciaEstoqueColSaldo: 'Saldo',
  divergenciaEstoqueColMovimentos: 'Soma dos movimentos',
  vazioDivergenciaEstoque: 'Sem divergência',
  secSemGiro: 'Sem giro',
  semGiroHint: 'hint sem giro',
  semGiroColSaldo: 'Saldo',
  semGiroColValor: 'Valor imobilizado',
  semGiroColUltimaVenda: 'Última venda',
  semGiroNuncaVendeu: 'nunca vendeu',
  vazioSemGiro: 'Sem itens sem giro',
  secVendasDetalhe: 'Vendas do período',
  vendasColData: 'Data',
  vendasColCliente: 'Cliente',
  vendasColVendedor: 'Vendedor',
  vendasColForma: 'Forma',
  vendasColValor: 'Valor',
  vendasColStatus: 'Status',
  vendasSemCliente: '—',
  vazioVendasDetalhe: 'Sem vendas',
  origemChina: 'China',
  origemBrasil: 'Brasil',
  vazioProdutos: 'Sem produtos',
  saldoMinTemplate: 'Saldo {{atual}} / Min {{min}}',
  reporTemplate: 'REPOR {{n}}',
  vazioEstoque: 'Sem estoque crítico',
  tooltipFaturado: 'Faturado',
  noDataLabel: 'Sem dados',
  erroTitulo: 'Erro',
  filtros: {
    de: 'De',
    ate: 'Até',
    aplicar: 'Aplicar',
    exportarCsv: 'Exportar vendas/dia (CSV)',
    csvFilename: 'relatorios.csv',
    preset7: '7 dias',
    preset15: '15 dias',
    preset30: '30 dias',
    presetsAria: 'Presets',
  },
  locale: 'pt-BR',
  kardex: {
    titulo: 'Kardex',
    semMovimentos: 'Sem movimentações',
    semMovimentosSub: 'As entradas e saídas aparecerão aqui.',
    tipoMap: {},
  },
} satisfies RelatoriosLabels

function baseDados(overrides: Partial<RelatoriosDados> = {}): RelatoriosDados {
  return {
    periodo: { de: '2026-07-18', ate: '2026-08-08', aviso: 'nenhum' },
    tzRelatorio: 'America/Sao_Paulo',
    resumoExecutivo: {
      itens_vendidos: 10,
      vendas_concluidas: 4,
      vendas_canceladas: 0,
      taxa_cancelamento: 0,
      cobertura_custo: 0.5,
      custo_confiavel: false,
      margem_bruta_estimada: null,
    },
    porDia: [
      { dia: '2026-08-07', num_vendas: 1, total_liquido: 30, ticket_medio: 30, total_desconto: 0 },
      { dia: '2026-07-19', num_vendas: 2, total_liquido: 20, ticket_medio: 10, total_desconto: 0 },
    ],
    top: [],
    baixo: [
      {
        id: 'p1',
        nome: 'Item',
        codigo_barras: null,
        quantidade_atual: 0,
        estoque_minimo: 0,
        deficit: 1,
      },
    ],
    margemPorVenda: [],
    curvaAbc: [],
    coberturaEstoque: [
      {
        produtoId: 'g1',
        nome: 'geladeira',
        lojaId: 'l1',
        quantidadeAtual: 10,
        mediaDiariaVendida: 0.001,
        diasCobertura: 7470,
      },
    ],
    divergenciaEstoque: [
      {
        produtoId: 'g1',
        nome: 'geladeira',
        lojaId: 'l1',
        saldoEstoque: 10,
        somaMovimentos: 8,
        divergencia: 2,
        qtdMovimentos: 5,
        ultimoMovimentoEm: '2026-08-07T10:00:00.000Z',
      },
    ],
    semGiro: [],
    vendasDetalhe: [],
    rpcErro: null,
    ...overrides,
  }
}

describe('RelatoriosContent presentation', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    flushSync(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('não exibe enum nenhum e remove fatia inventada de ajustes', () => {
    flushSync(() => {
      root.render(renderRelatorios(<RelatoriosContent dados={baseDados()} labels={labels} />))
    })
    expect(container.textContent).toContain('Período: 2026-07-18 a 2026-08-08')
    expect(container.textContent).not.toContain('(nenhum)')
    expect(container.textContent).toContain('Status das vendas')
    expect(container.textContent).not.toMatch(/Ajustes/i)
    const donut = container.querySelector('[data-testid="donut"]')
    expect(donut?.textContent).toContain('Concluídas:4')
    expect(donut?.textContent).toContain('Canceladas:0')
    expect(container.textContent).toContain('Faturamento')
    expect(container.textContent).toContain('Custo não confiável')
    expect(container.textContent).not.toContain('XLSX')
  })

  it('mostra reposição e cobertura na aba estoque', () => {
    flushSync(() => {
      root.render(renderRelatorios(<RelatoriosContent dados={baseDados()} labels={labels} />))
    })
    const estoqueTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (el) => el.textContent === 'Estoque',
    ) as HTMLButtonElement
    expect(estoqueTab).toBeTruthy()
    flushSync(() => {
      estoqueTab.click()
    })
    expect(container.textContent).toContain('mínimo não configurado')
    expect(container.textContent).toContain('>365 dias de cobertura')
    const link = container.querySelector('a[href="/admin/estoque"]')
    expect(link?.textContent).toContain('Abrir Estoque')
    // Divergência de estoque (v_estoque_ledger_divergencia) — item F da reconciliação.
    expect(container.textContent).toContain('Divergência')
    expect(container.textContent).toContain('geladeira')
    expect(container.textContent).toContain('+2')
  })

  it('RM-03: linhas de produto/venda linkam para o registro correspondente', () => {
    flushSync(() => {
      root.render(
        renderRelatorios(
          <RelatoriosContent
            dados={baseDados({
              top: [
                {
                  id: 'prod-top-1',
                  nome: 'Produto Top',
                  origem: 'brasil',
                  total_quantidade: 5,
                  total_valor: 100,
                  num_vendas: 3,
                },
              ],
            })}
            labels={labels}
          />,
        ),
      )
    })
    // Aba Produtos: top produtos linka para o catálogo.
    const produtosTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (el) => el.textContent === 'Produtos',
    ) as HTMLButtonElement
    flushSync(() => produtosTab.click())
    expect(container.querySelector('a[href="/admin/catalogo?produto=prod-top-1"]')).toBeTruthy()

    // Aba Estoque: reposição e cobertura/divergência linkam para o catálogo.
    const estoqueTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (el) => el.textContent === 'Estoque',
    ) as HTMLButtonElement
    flushSync(() => estoqueTab.click())
    expect(container.querySelector('a[href="/admin/catalogo?produto=p1"]')).toBeTruthy()
    expect(container.querySelector('a[href="/admin/catalogo?produto=g1"]')).toBeTruthy()
  })

  it('RM-04: clicar numa linha de divergência abre o Kardex do produto, sem navegar', () => {
    flushSync(() => {
      root.render(renderRelatorios(<RelatoriosContent dados={baseDados()} labels={labels} />))
    })
    const estoqueTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (el) => el.textContent === 'Estoque',
    ) as HTMLButtonElement
    flushSync(() => estoqueTab.click())

    expect(container.querySelector('[data-testid="kardex-sheet"]')).toBeNull()
    const linhaDivergencia = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('geladeira'),
    ) as HTMLButtonElement
    expect(linhaDivergencia).toBeTruthy()
    flushSync(() => linhaDivergencia.click())

    const sheet = container.querySelector('[data-testid="kardex-sheet"]')
    expect(sheet?.textContent).toBe('geladeira')
  })

  it('esconde divergência de estoque quando não há nenhuma acima do ruído de arredondamento', () => {
    flushSync(() => {
      root.render(
        renderRelatorios(
          <RelatoriosContent
            dados={baseDados({ divergenciaEstoque: [] })}
            labels={labels}
          />,
        ),
      )
    })
    const estoqueTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (el) => el.textContent === 'Estoque',
    ) as HTMLButtonElement
    flushSync(() => {
      estoqueTab.click()
    })
    expect(container.textContent).toContain('Sem divergência')
  })
})
