import { describe, expect, it } from 'vitest'
import {
  avisoPeriodoVisivel,
  formatDiasCobertura,
  parseRelatoriosTab,
  resolverViewRelatorios,
  sortCoberturaUrgente,
  sortPorDiaAsc,
  sortReposicaoPorDeficit,
  sumFaturamento,
  ticketMedio,
} from './relatoriosUi'

describe('relatoriosUi', () => {
  it('oculta aviso nenhum e mantém avisos reais', () => {
    expect(avisoPeriodoVisivel('nenhum')).toBeNull()
    expect(avisoPeriodoVisivel('periodo_limitado')).toBe('periodo_limitado')
  })

  it('ordena faturamento por dia crescente', () => {
    const sorted = sortPorDiaAsc([
      { dia: '2026-08-07', total_liquido: 3 },
      { dia: '2026-07-19', total_liquido: 1 },
      { dia: '2026-07-17', total_liquido: 2 },
    ])
    expect(sorted.map((r) => r.dia)).toEqual(['2026-07-17', '2026-07-19', '2026-08-07'])
  })

  it('calcula faturamento e ticket', () => {
    expect(sumFaturamento([{ total_liquido: 10 }, { total_liquido: 5 }])).toBe(15)
    expect(ticketMedio(100, 4)).toBe(25)
    expect(ticketMedio(100, 0)).toBeNull()
  })

  it('prioriza reposição por déficit e cobertura por urgência', () => {
    expect(sortReposicaoPorDeficit([{ deficit: 1 }, { deficit: 5 }]).map((r) => r.deficit)).toEqual([5, 1])
    expect(
      sortCoberturaUrgente([
        { diasCobertura: 120 },
        { diasCobertura: null },
        { diasCobertura: 3 },
      ]).map((r) => r.diasCobertura),
    ).toEqual([3, 120])
  })

  it('limita dias de cobertura na apresentação', () => {
    expect(
      formatDiasCobertura(7470, { dias: 'dias de cobertura', diasCap: '>{{n}} dias de cobertura' }),
    ).toBe('>365 dias de cobertura')
    expect(
      formatDiasCobertura(12, { dias: 'dias de cobertura', diasCap: '>{{n}} dias de cobertura' }),
    ).toBe('~12 dias de cobertura')
  })

  it('parseia aba da URL com fallback', () => {
    expect(parseRelatoriosTab('estoque')).toBe('estoque')
    expect(parseRelatoriosTab('xyz')).toBe('visao')
  })
})

describe('resolverViewRelatorios (PR 7 — relatório clássico aposentado)', () => {
  it('?view= válido sem ?tab= não redireciona', () => {
    expect(resolverViewRelatorios('dre-financeiro', undefined)).toEqual({
      view: 'dre-financeiro',
      precisaRedirecionar: false,
    })
  })

  it.each([
    ['visao', 'vendas-caixas'],
    ['vendas', 'vendas-caixas'],
    ['produtos', 'produtos-estoque'],
    ['estoque', 'produtos-estoque'],
    ['margem', 'dre-financeiro'],
  ])('?tab=%s cai em %s', (tab, view) => {
    expect(resolverViewRelatorios(undefined, tab)).toEqual({ view, precisaRedirecionar: true })
  })

  it('sem parâmetros abre Vendas & Caixas (com redirecionamento)', () => {
    expect(resolverViewRelatorios(undefined, undefined)).toEqual({
      view: 'vendas-caixas',
      precisaRedirecionar: true,
    })
  })

  it('?view= válido vence ?tab= legado, mas o ?tab= é removido da URL', () => {
    expect(resolverViewRelatorios('crm-auditoria', 'margem')).toEqual({
      view: 'crm-auditoria',
      precisaRedirecionar: true,
    })
  })

  it('valores desconhecidos não quebram', () => {
    expect(resolverViewRelatorios('xyz', 'abc').view).toBe('vendas-caixas')
  })
})
