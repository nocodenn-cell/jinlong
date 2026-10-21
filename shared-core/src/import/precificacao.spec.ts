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
