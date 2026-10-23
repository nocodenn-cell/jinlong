import { describe, expect, it } from 'vitest'
import { comporValorAduaneiro, type ItemValorAduaneiro } from './valorAduaneiro'

/**
 * Esperados calculados À MÃO (não pelo código):
 * câmbio 5,0277; FOB USD 2.000 / 9.000 / 3.200 (= 14.200, proporção 10:45:16 de 71).
 *  FOB BRL: 10.055,40 / 45.249,30 / 16.088,64 (Σ 71.393,34)
 *  Frete USD 2.500 = 12.569,25 → ×10/71, ×45/71, ×16/71 em micro-reais (escala 6):
 *    1.770.316.901 r29 | 7.966.426.056 r24 | 2.832.507.042 r18 ; sobra 1 → maior resto (i1)
 *    ⇒ 1.770,316902 / 7.966,426056 / 2.832,507042 (Σ 12.569,250000)
 *  Seguro USD 150 = 754,155 → 106.219.014 r6 | 477.985.563 r27 | 169.950.422 r38 ; sobra 1 → i3
 *    ⇒ 106,219014 / 477,985563 / 169,950423 (Σ 754,155000)
 *  VA: 11.931,935916 / 53.693,711619 / 19.091,097465 (Σ 84.716,745000)
 *  → em centavos 11.931,94 / 53.693,71 / 19.091,10 = VAs manuais do cenário real.
 */
const it3 = (id: string, usd: string, extra: Partial<ItemValorAduaneiro> = {}): ItemValorAduaneiro =>
  ({ id, moeda: 'USD', valor_mercadoria_moeda: usd, ...extra })
const cambios = [{ moeda: 'USD', taxa: '5.0277' }]
const cenario = {
  itens: [it3('i1', '2000'), it3('i2', '9000'), it3('i3', '3200')],
  cambios,
  frete: [{ moeda: 'USD', valor: '2500' }],
  seguro: [{ moeda: 'USD', valor: '150' }],
}

describe('comporValorAduaneiro — cenário real (câmbio 5,0277)', () => {
  const r = comporValorAduaneiro(cenario)

  it('memória por item: FOB, frete, seguro, VA e critério (default VALOR_FOB)', () => {
    expect(r.itens.map(({ valor_aduaneiro_brl_2: _c, ...x }) => x)).toEqual([
      { item_id: 'i1', fob_brl: '10055.400000', frete_brl: '1770.316902', seguro_brl: '106.219014', valor_aduaneiro_brl: '11931.935916', criterio_frete: 'VALOR_FOB', criterio_seguro: 'VALOR_FOB' },
      { item_id: 'i2', fob_brl: '45249.300000', frete_brl: '7966.426056', seguro_brl: '477.985563', valor_aduaneiro_brl: '53693.711619', criterio_frete: 'VALOR_FOB', criterio_seguro: 'VALOR_FOB' },
      { item_id: 'i3', fob_brl: '16088.640000', frete_brl: '2832.507042', seguro_brl: '169.950423', valor_aduaneiro_brl: '19091.097465', criterio_frete: 'VALOR_FOB', criterio_seguro: 'VALOR_FOB' },
    ])
    expect(r.semBase).toEqual([])
    expect(r.pendencias).toEqual([])
  })

  it('reproduz os VAs manuais em centavos', () => {
    expect(r.itens.map((x) => x.valor_aduaneiro_brl_2)).toEqual(['11931.94', '53693.71', '19091.10'])
  })

  it('conservação exata dos totais', () => {
    expect(r.totais).toEqual({ fob_brl: '71393.340000', frete_brl: '12569.250000', seguro_brl: '754.155000', valor_aduaneiro_brl: '84716.745000' })
  })

  it('ordem de entrada não altera o resultado (rateio determinístico por id)', () => {
    const inv = comporValorAduaneiro({ ...cenario, itens: [...cenario.itens].reverse() })
    expect([...inv.itens].sort((a, b) => a.item_id.localeCompare(b.item_id))).toEqual(r.itens)
  })
})

describe('comporValorAduaneiro — bordas', () => {
  it('sem câmbio: item sem base (não inventa) e frete repartido só entre os demais com pendência', () => {
    const r = comporValorAduaneiro({ itens: [it3('a', '100'), it3('b', '100', { moeda: 'CNY' })], cambios, frete: [{ moeda: 'BRL', valor: '10' }], seguro: [] })
    expect(r.semBase).toEqual([{ item_id: 'b', motivo: 'SEM_CAMBIO' }])
    expect(r.itens.map((x) => [x.item_id, x.valor_aduaneiro_brl])).toEqual([['a', '512.770000']])
    expect(r.pendencias).toContain('RATEIO_PARCIAL')
  })

  it('frete em moeda sem câmbio: pendência, não soma zero em silêncio', () => {
    const r = comporValorAduaneiro({ itens: [it3('a', '100')], cambios, frete: [{ moeda: 'EUR', valor: '10' }], seguro: [] })
    expect(r.pendencias).toContain('FRETE_SEM_CAMBIO')
    expect(r.totais.frete_brl).toBe('0.000000')
  })

  it('item em BRL e frete em BRL; seguro com critério PESO_BRUTO explícito', () => {
    const r = comporValorAduaneiro({
      itens: [{ id: 'a', moeda: 'BRL', valor_mercadoria_moeda: '300', peso_bruto_kg: '1' }, { id: 'b', moeda: 'BRL', valor_mercadoria_moeda: '100', peso_bruto_kg: '3' }],
      cambios: [], frete: [{ moeda: 'BRL', valor: '40' }], seguro: [{ moeda: 'BRL', valor: '8' }], criterio_seguro: 'PESO_BRUTO',
    })
    // frete por FOB 3:1 → 30 / 10 ; seguro por peso 1:3 → 2 / 6
    expect(r.itens.map((x) => [x.frete_brl, x.seguro_brl, x.valor_aduaneiro_brl, x.criterio_seguro])).toEqual([
      ['30.000000', '2.000000', '332.000000', 'PESO_BRUTO'], ['10.000000', '6.000000', '116.000000', 'PESO_BRUTO'],
    ])
  })

  it('critério por peso sem peso em algum item: pendência e nada rateado por aquele critério', () => {
    const r = comporValorAduaneiro({ itens: [it3('a', '1', { peso_liquido_kg: '2' }), it3('b', '1')], cambios, frete: [{ moeda: 'BRL', valor: '9' }], seguro: [], criterio_frete: 'PESO_LIQUIDO' })
    expect(r.pendencias).toContain('PESO_AUSENTE')
    expect(r.totais.frete_brl).toBe('0.000000')
  })

  it('base de rateio zero com frete > 0: pendência, sem exceção', () => {
    const r = comporValorAduaneiro({ itens: [it3('a', '0')], cambios, frete: [{ moeda: 'BRL', valor: '9' }], seguro: [] })
    expect(r.pendencias).toContain('BASE_RATEIO_ZERO')
    expect(r.itens[0].valor_aduaneiro_brl).toBe('0.000000')
  })

  it('maior resto: 10 centavos-µ em 3 pesos iguais conservam o total (sem resíduo no último)', () => {
    const r = comporValorAduaneiro({ itens: [it3('a', '1'), it3('b', '1'), it3('c', '1')], cambios: [{ moeda: 'USD', taxa: '1' }], frete: [{ moeda: 'BRL', valor: '0.00001' }], seguro: [] })
    expect(r.itens.map((x) => x.frete_brl)).toEqual(['0.000004', '0.000003', '0.000003'])
  })
})
