import { describe, expect, it } from 'vitest'
import { compararEstimadoReal, simularPreco } from './precificacao'
import { sugerirCriterioRateio } from './sugestaoCriterio'

describe('precificação simulada', () => {
  it('margem sobre o preço', () => {
    expect(simularPreco('10.000000', { canal: 'VAREJO', modo: 'MARGEM', percentual: '30' })).toMatchObject({ preco_brl: '14.29', lucro_unitario_brl: '4.29', margem_resultante_pct: '30.02' })
  })
  it('markup sobre o custo', () => {
    expect(simularPreco('10', { canal: 'ATACADO', modo: 'MARKUP', percentual: '50' })).toMatchObject({ preco_brl: '15.00', margem_resultante_pct: '33.33', markup_resultante_pct: '50.00' })
  })
  it('despesas de venda por dentro', () => {
    // 10 / (1 − 0,30 − 0,10) = 16.666… → 16.67
    expect(simularPreco('10', { canal: 'VAREJO', modo: 'MARGEM', percentual: '30', despesas_venda_pct: '10' }).preco_brl).toBe('16.67')
    // 10 × 1,5 / 0,9 = 16.666… → 16.67
    expect(simularPreco('10', { canal: 'ATACADO', modo: 'MARKUP', percentual: '50', despesas_venda_pct: '10' }).preco_brl).toBe('16.67')
  })
  it('centavos HALF_UP e limites', () => {
    expect(simularPreco('0.335', { canal: 'VAREJO', modo: 'MARKUP', percentual: '0' }).preco_brl).toBe('0.34')
    expect(() => simularPreco('10', { canal: 'VAREJO', modo: 'MARGEM', percentual: '100' })).toThrow('MARGEM_IMPOSSIVEL')
    expect(() => simularPreco('0', { canal: 'VAREJO', modo: 'MARGEM', percentual: '10' })).toThrow('CUSTO_INVALIDO')
    expect(() => simularPreco('10', { canal: 'VAREJO', modo: 'MARGEM', percentual: '-1' })).toThrow()
  })
  it('estimado × real por item', () => {
    const c = compararEstimadoReal([{ item_id: 'a', custo_unitario_brl: '10' }, { item_id: 'b', custo_unitario_brl: '5' }], [{ item_id: 'a', custo_unitario_brl: '11.5' }])
    expect(c[0]).toMatchObject({ variacao_brl: '1.500000', variacao_pct: '15.00' })
    expect(c[1]).toMatchObject({ real_brl: null, variacao_brl: null })
  })
  it('critério de rateio sugerido', () => {
    expect(sugerirCriterioRateio('Frete internacional').criterio).toBe('PESO_BRUTO')
    expect(sugerirCriterioRateio('Seguro').criterio).toBe('VALOR_ADUANEIRO')
    expect(sugerirCriterioRateio('Armazenagem porto').criterio).toBe('VOLUME')
    expect(sugerirCriterioRateio('运费').criterio).toBe('PESO_BRUTO')
    expect(sugerirCriterioRateio('xyz').criterio).toBe('VALOR_ADUANEIRO')
  })
})

import { arredondarComercial, repricoSugerido, simularFaixasAtacado } from './precificacao'
import { calcularLandedCost } from './landedCost'

describe('atacado por faixas, arredondamento e repreço', () => {
  it('arredondamento comercial para cima', () => {
    expect(arredondarComercial('14.29', '90')).toBe('14.90')
    expect(arredondarComercial('14.95', '90')).toBe('15.90')
    expect(arredondarComercial('14.29', '99')).toBe('14.99')
    expect(arredondarComercial('14.01', '00')).toBe('15.00')
    expect(arredondarComercial('14.00', '00')).toBe('14.00')
  })
  it('faixas ordenadas, preço não cresce com a quantidade', () => {
    const f = simularFaixasAtacado('10', [{ quantidade_minima: 50, modo: 'MARKUP', percentual: '20' }, { quantidade_minima: 10, modo: 'MARKUP', percentual: '30' }], '90')
    expect(f.map((x) => [x.quantidade_minima, x.preco_brl, x.preco_arredondado_brl])).toEqual([[10, '13.00', '13.90'], [50, '12.00', '12.90']])
    expect(() => simularFaixasAtacado('10', [{ quantidade_minima: 10, modo: 'MARKUP', percentual: '10' }, { quantidade_minima: 50, modo: 'MARKUP', percentual: '30' }])).toThrow('FAIXA_PRECO_CRESCENTE')
    expect(() => simularFaixasAtacado('10', [{ quantidade_minima: 10, modo: 'MARKUP', percentual: '10' }, { quantidade_minima: 10, modo: 'MARKUP', percentual: '5' }])).toThrow('FAIXA_DUPLICADA')
  })
  it('repreço mantém a margem do estimado sobre o custo real', () => {
    // estimado: custo 10, preço 20 (margem 50%); real 12 → 24
    expect(repricoSugerido('20.00', '10', '12')).toEqual({ preco_brl: '24.00', margem_mantida_pct: '50.0000' })
  })
  it('margem efetiva recalculada sobre o preço ARREDONDADO (CALC-001.1 P6)', () => {
    // custo 4,50; despesas 10%: markup 30 → 6,50 e markup 20 → 6,00; ambas arredondam para 6,90.
    // lucro 2,40 → margem 2,40/6,90 = 34,78%; markup 2,40/4,50 = 53,33%; líquida (2,40 − 0,69)/6,90 = 24,78%.
    const f = simularFaixasAtacado('4.50', [{ quantidade_minima: 10, modo: 'MARKUP', percentual: '30' }, { quantidade_minima: 50, modo: 'MARKUP', percentual: '20' }], '90', '10')
    expect(f.map((x) => [x.margem_resultante_pct, x.preco_arredondado_brl])).toEqual([['30.77', '6.90'], ['25.00', '6.90']]) // alvo preservado
    for (const x of f) {
      expect(x).toMatchObject({ preco_arredondado_brl: '6.90', lucro_efetivo_brl: '2.40', margem_efetiva_pct: '34.78', markup_efetivo_pct: '53.33', margem_liquida_efetiva_pct: '24.78' })
    }
  })
  it('margem efetiva sem despesas: custo 5,00 → 6,90', () => {
    // 5 × 1,3 = 6,50 → 6,90; lucro 1,90 → 27,54% s/ preço; 38,00% s/ custo
    const [x] = simularFaixasAtacado('5.00', [{ quantidade_minima: 10, modo: 'MARKUP', percentual: '30' }], '90')
    expect(x).toMatchObject({ preco_arredondado_brl: '6.90', margem_efetiva_pct: '27.54', markup_efetivo_pct: '38.00', margem_liquida_efetiva_pct: '27.54' })
  })
  it('sem arredondamento, margem efetiva = margem-alvo', () => {
    const f = simularFaixasAtacado('4.50', [{ quantidade_minima: 10, modo: 'MARKUP', percentual: '30' }, { quantidade_minima: 50, modo: 'MARKUP', percentual: '20' }], 'NENHUM', '10')
    for (const x of f) {
      expect(x.margem_efetiva_pct).toBe(x.margem_resultante_pct)
      expect(x.markup_efetivo_pct).toBe(x.markup_resultante_pct)
    }
  })
})

describe('critério IGUAL no motor existente', () => {
  it('divide a despesa em partes iguais por item, conservando centavos', () => {
    const base = JSON.parse(JSON.stringify(require('../../../docs/import-intelligence/fixtures/casos/04-rateio-valor-aduaneiro-3-itens/input.json')))
    const desp = base.despesas.find((d: { atribuicao: { modo: string } }) => d.atribuicao.modo === 'RATEIO')
    desp.atribuicao.criterio = 'IGUAL'
    const r = calcularLandedCost(base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const partes = r.value.rateios.filter((x) => x.origem_id === desp.id).map((x) => x.base_item)
    expect(new Set(partes).size).toBe(1)
    expect(r.value.conservacao.ok).toBe(true)
  })
})
