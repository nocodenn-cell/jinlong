/**
 * CALC-001.1 — conciliação INDEPENDENTE do QA (A06).
 *
 * Todos os esperados abaixo são literais calculados fora do motor (Python `fractions`, frações
 * exatas, HALF_UP e maior resto reimplementados à parte). A conta de cada um está no comentário.
 * Memória completa: docs/import-intelligence/21-CALC-001-1-CONCILIACAO.md.
 */
import { describe, expect, it } from 'vitest'
import { calcularLandedCost } from './landedCost'
import { simularFaixasAtacado } from './precificacao'
import { comporValorAduaneiro } from './valorAduaneiro'
import { calcularAfrmm } from './regime'
import { DESPESAS_FEDERAIS_INFO } from './catalogoNacional'
import type { DespesaEntrada, ItemEntrada, LandedCostInput, TributoEntrada } from './types'


// ───────────────────────────── P6 — margem efetiva ─────────────────────────────
// Regra conferida: preço MARKUP = custo × (1+mk)/(1−dv), MARGEM = custo/(1−m−dv), HALF_UP a centavos;
// arredonda PARA CIMA até o final ,90; lucro = preço_arred − custo (custo levado a centavos HALF_UP);
// margem = lucro/preço; markup = lucro/custo; líquida = (lucro − dv×preço)/preço; tudo HALF_UP 2.
describe('P6 — margem efetiva sobre o preço arredondado (independente)', () => {
  it('custo 4,50; markup 30 (≥10) e 20 (≥50); final ,90; despesas 10%', () => {
    // 4,50×1,30/0,90 = 6,50 → 6,90 ; 4,50×1,20/0,90 = 6,00 → 6,90
    // lucro 2,40; 2,40/6,90 = 0,347826… → 34,78 ; 2,40/4,50 = 0,53333… → 53,33 ; (2,40−0,69)/6,90 = 0,247826… → 24,78
    const f = simularFaixasAtacado('4.50', [{ quantidade_minima: 10, modo: 'MARKUP', percentual: '30' }, { quantidade_minima: 50, modo: 'MARKUP', percentual: '20' }], '90', '10')
    expect(f.map((x) => [x.preco_brl, x.preco_arredondado_brl, x.lucro_efetivo_brl, x.margem_efetiva_pct, x.markup_efetivo_pct, x.margem_liquida_efetiva_pct])).toEqual([
      ['6.50', '6.90', '2.40', '34.78', '53.33', '24.78'],
      ['6.00', '6.90', '2.40', '34.78', '53.33', '24.78'],
    ])
  })
  it('custo 5,00 sem despesas: 6,50 → 6,90; 1,90/6,90 = 27,54; 1,90/5,00 = 38,00', () => {
    const [x] = simularFaixasAtacado('5.00', [{ quantidade_minima: 10, modo: 'MARKUP', percentual: '30' }], '90')
    expect([x.preco_arredondado_brl, x.margem_efetiva_pct, x.markup_efetivo_pct, x.margem_liquida_efetiva_pct]).toEqual(['6.90', '27.54', '38.00', '27.54'])
  })
  it('extremo 1: preço calculado já termina em ,90 → arredondado = calculado; efetiva = alvo', () => {
    // 5,52×1,125/0,90 = 6,90 exato ; lucro 1,38 ; 1,38/6,90 = 20,00 ; 1,38/5,52 = 25,00 ; (1,38−0,69)/6,90 = 10,00
    const [x] = simularFaixasAtacado('5.52', [{ quantidade_minima: 1, modo: 'MARKUP', percentual: '12.5' }], '90', '10')
    expect([x.preco_brl, x.preco_arredondado_brl, x.margem_resultante_pct, x.margem_efetiva_pct, x.markup_efetivo_pct, x.margem_liquida_efetiva_pct])
      .toEqual(['6.90', '6.90', '20.00', '20.00', '25.00', '10.00'])
  })
  it('extremo 2: custo com 6 casas (4,123457) — lucro sobre o custo em centavos (4,12)', () => {
    // 4,123457×1,30 = 5,3604941 → 5,36 → 5,90 ; custo a centavos 4,12 ; lucro 1,78
    // 1,78/5,90 = 0,301694… → 30,17 ; 1,78/4,12 = 0,432038… → 43,20
    // (com custo exato a margem seria (5,90−4,123457)/5,90 = 30,11 — convenção registrada no doc 21)
    const [x] = simularFaixasAtacado('4.123457', [{ quantidade_minima: 1, modo: 'MARKUP', percentual: '30' }], '90')
    expect([x.preco_brl, x.preco_arredondado_brl, x.lucro_efetivo_brl, x.margem_efetiva_pct, x.markup_efetivo_pct]).toEqual(['5.36', '5.90', '1.78', '30.17', '43.20'])
  })
  it('extremo 3: despesas "0" ≡ sem despesas (líquida = bruta)', () => {
    // 4,50×1,30 = 5,85 → 5,90 ; lucro 1,40 ; 1,40/5,90 = 23,73 ; 1,40/4,50 = 31,11
    const [x] = simularFaixasAtacado('4.50', [{ quantidade_minima: 1, modo: 'MARKUP', percentual: '30' }], '90', '0')
    expect([x.preco_arredondado_brl, x.margem_efetiva_pct, x.markup_efetivo_pct, x.margem_liquida_efetiva_pct]).toEqual(['5.90', '23.73', '31.11', '23.73'])
  })
  it('modo MARGEM com despesas: 4,50/(1−0,30−0,10) = 7,50 → 7,90', () => {
    // lucro 3,40 ; 3,40/7,90 = 43,04 ; 3,40/4,50 = 75,56 ; (3,40−0,79)/7,90 = 33,04
    const [x] = simularFaixasAtacado('4.50', [{ quantidade_minima: 1, modo: 'MARGEM', percentual: '30' }], '90', '10')
    expect([x.preco_brl, x.preco_arredondado_brl, x.margem_efetiva_pct, x.markup_efetivo_pct, x.margem_liquida_efetiva_pct]).toEqual(['7.50', '7.90', '43.04', '75.56', '33.04'])
  })
})

// ───────────────────────────── P1/P3 — valor aduaneiro ─────────────────────────────
const usd = [{ moeda: 'USD', taxa: '5.0277' }]
const it3 = [
  { id: 'i1', moeda: 'USD', valor_mercadoria_moeda: '2000' },
  { id: 'i2', moeda: 'USD', valor_mercadoria_moeda: '9000' },
  { id: 'i3', moeda: 'USD', valor_mercadoria_moeda: '3200' },
]
describe('P1/P3 — comporValorAduaneiro (independente)', () => {
  it('cenário real: rateio pelo FOB com maior resto em µR$', () => {
    // FOB: 10.055,40 / 45.249,30 / 16.088,64 = 71.393,34. Frete 2.500×5,0277 = 12.569,25; seguro 150×5,0277 = 754,155.
    // Frete exato: 1.770,31690141 / 7.966,42605634 / 2.832,50704225 → pisos em µ somam 12.569,249999 (sobra 1 µ);
    //   restos (×S) 29.160.660.000 > 24.132.960.000 > 18.099.720.000 → +1 µ para i1 → 1.770,316902 / 7.966,426056 / 2.832,507042.
    // Seguro exato: 106,21901408 / 477,98556338 / 169,95042254 → sobra 1 µ; maior resto i3 → 106,219014 / 477,985563 / 169,950423.
    const r = comporValorAduaneiro({ itens: it3, cambios: usd, frete: [{ moeda: 'USD', valor: '2500' }], seguro: [{ moeda: 'USD', valor: '150' }] })
    expect(r.itens.map((x) => [x.frete_brl, x.seguro_brl, x.valor_aduaneiro_brl, x.valor_aduaneiro_brl_2])).toEqual([
      ['1770.316902', '106.219014', '11931.935916', '11931.94'],
      ['7966.426056', '477.985563', '53693.711619', '53693.71'],
      ['2832.507042', '169.950423', '19091.097465', '19091.10'],
    ])
    expect(r.totais).toEqual({ fob_brl: '71393.340000', frete_brl: '12569.250000', seguro_brl: '754.155000', valor_aduaneiro_brl: '84716.745000' })
    expect(r.pendencias).toEqual([])
    // Nota: a soma dos VAs em centavos é 84.716,75 (≠ 84.716,745 por arredondamento de exibição).
  })
  it('item sem câmbio: fica sem base e o frete vai só para os demais', () => {
    // i1 em EUR sem taxa. Frete 12.569,25 por FOB 45.249,30 : 16.088,64 → 9.272,397541 / 3.296,852459 (sobra 0 após pisos+resto).
    const r = comporValorAduaneiro({ itens: [{ ...it3[0], moeda: 'EUR' }, it3[1], it3[2]], cambios: usd, frete: [{ moeda: 'USD', valor: '2500' }], seguro: [] })
    expect(r.semBase).toEqual([{ item_id: 'i1', motivo: 'SEM_CAMBIO' }])
    expect(r.pendencias).toEqual(['RATEIO_PARCIAL'])
    expect(r.itens.map((x) => [x.item_id, x.frete_brl, x.valor_aduaneiro_brl])).toEqual([['i2', '9272.397541', '54521.697541'], ['i3', '3296.852459', '19385.492459']])
  })
  it('base de rateio zero: pendência, frete não distribuído (nunca inventa)', () => {
    const r = comporValorAduaneiro({ itens: [{ id: 'a', moeda: 'BRL', valor_mercadoria_moeda: '0' }, { id: 'b', moeda: 'BRL', valor_mercadoria_moeda: '0' }], cambios: [], frete: [{ moeda: 'BRL', valor: '100' }], seguro: [] })
    expect(r.pendencias).toEqual(['BASE_RATEIO_ZERO'])
    expect(r.totais.frete_brl).toBe('0.000000')
  })
  it('um único item recebe todo o frete e seguro: 10.055,40 + 12.569,25 + 754,155 = 23.378,805', () => {
    const r = comporValorAduaneiro({ itens: [it3[0]], cambios: usd, frete: [{ moeda: 'USD', valor: '2500' }], seguro: [{ moeda: 'USD', valor: '150' }] })
    expect(r.itens.map((x) => [x.valor_aduaneiro_brl, x.valor_aduaneiro_brl_2])).toEqual([['23378.805000', '23378.81']])
  })
  it('rateio por peso com peso ausente: pendência PESO_AUSENTE e nenhum frete rateado', () => {
    const r = comporValorAduaneiro({
      itens: [{ ...it3[0], peso_liquido_kg: '150' }, { ...it3[1], peso_liquido_kg: null }, { ...it3[2], peso_liquido_kg: '350' }],
      cambios: usd, frete: [{ moeda: 'USD', valor: '2500' }], seguro: [], criterio_frete: 'PESO_LIQUIDO',
    })
    expect(r.pendencias).toEqual(['PESO_AUSENTE'])
    expect(r.itens.map((x) => x.frete_brl)).toEqual(['0.000000', '0.000000', '0.000000'])
  })
  it('empate de restos: desempate por id crescente, independente da ordem de entrada', () => {
    // 10,000000 BRL / 3 pesos iguais = 3.333.333 µ cada, resto 1 cada, sobra 1 µ → id "a" (menor) leva +1.
    const itens = ['c', 'a', 'b'].map((id) => ({ id, moeda: 'BRL', valor_mercadoria_moeda: '1' }))
    const r = comporValorAduaneiro({ itens, cambios: [], frete: [{ moeda: 'BRL', valor: '10' }], seguro: [{ moeda: 'BRL', valor: '0.000002' }] })
    // seguro 2 µ: quocientes 0, restos iguais → "a" e "b" recebem 1 µ cada.
    expect(r.itens.map((x) => [x.item_id, x.frete_brl, x.seguro_brl])).toEqual([
      ['c', '3.333333', '0.000000'], ['a', '3.333334', '0.000001'], ['b', '3.333333', '0.000001'],
    ])
    expect(r.totais.frete_brl).toBe('10.000000')
  })
})

// ───────────────────────────── P2 — AFRMM / Siscomex ─────────────────────────────
// conciliarEncargosAduaneiros e a classificação por texto (regex) vivem em pdv-importados (inteligencia.ts) e
// NÃO são importados aqui (o alias @shared-core não existe no tsc/vitest deste pacote). Os 3 cenários foram
// conferidos por script independente contra a função real e pelo teste do hub inteligenciaVa.test.ts —
// saídas registradas no doc 21 §5. Aqui ficam as partes de shared-core.
describe('P2 — encargos aduaneiros (independente, parte shared-core)', () => {
  it('AFRMM = 8% × 12.569,25 = 1.005,54 (exato 50.277/50); Siscomex 115,67; soma 1.121,21', () => {
    expect(calcularAfrmm('12569.25', true)).toBe('1005.54')
    expect(calcularAfrmm('12569.25', false)).toBe('0.00')
    expect(DESPESAS_FEDERAIS_INFO.siscomex_taxa_brl).toBe('115.67')
  })
  it('VA só com frete internacional e seguro: AFRMM/Siscomex fora → frete 12.569,25 e VA 84.716,745', () => {
    // Se o AFRMM (1.005,54) fosse somado ao frete, o total do VA seria 85.722,285 — o esperado abaixo o exclui.
    const r = comporValorAduaneiro({ itens: it3, cambios: usd, frete: [{ moeda: 'USD', valor: '2500' }], seguro: [{ moeda: 'USD', valor: '150' }] })
    expect([r.totais.frete_brl, r.totais.valor_aduaneiro_brl]).toEqual(['12569.250000', '84716.745000'])
  })
})

// ───────────────────────────── P1 no motor (sem banco) ─────────────────────────────
// Cenário sintético com os números da operação real (ids fictícios; ordem a<b<c igual à dos UUIDs reais).
const item = (id: string, usdV: string, qe: string, pb: string, vol: string, va: string | null): ItemEntrada => ({
  id, produto_id: null, moeda: 'USD', valor_mercadoria_moeda: usdV, valor_aduaneiro_brl: va, quantidade_comercial: qe, unidade_comercial: 'UN',
  fator_para_estoque: '1', quantidade_estoque: qe, peso_liquido_kg: null, peso_bruto_kg: pb, volume_m3: vol,
} as ItemEntrada)
const desp = (id: string, tipo: string, moeda: string, valor: string, criterio: string): DespesaEntrada =>
  ({ id, tipo, moeda, valor, incorporavel: true, atribuicao: { modo: 'RATEIO', criterio, justificativa: 'conciliacao QA A06' } }) as DespesaEntrada
const TRIB: Record<string, [string, string][]> = {
  'item-a': [['II', '2147.75'], ['IPI', '1372.77'], ['PIS_IMPORTACAO', '250.57'], ['COFINS_IMPORTACAO', '1151.43'], ['ICMS', '4386.84']],
  'item-b': [['II', '9664.87'], ['IPI', '6177.46'], ['PIS_IMPORTACAO', '1127.57'], ['COFINS_IMPORTACAO', '5181.44'], ['ICMS', '19740.77']],
  'item-c': [['II', '3092.76'], ['IPI', '2162.93'], ['PIS_IMPORTACAO', '400.91'], ['COFINS_IMPORTACAO', '1842.29'], ['ICMS', '6921.69']],
}
const tributos: TributoEntrada[] = Object.entries(TRIB).flatMap(([itemId, ts]) => ts.map(([cod, v]) => ({
  id: `t-${itemId}-${cod}`, tributo_codigo: cod, status_recuperabilidade: 'NAO_RECUPERAVEL', valor_apurado_brl: v, item_id: itemId,
  regra: { id: `r-${cod}`, incorpora_custo: true, vigencia_inicio: '2024-01-01', vigencia_fim: null }, data_fato_gerador: '2026-10-21', validado_por: null,
}) as TributoEntrada))
const DESPESAS = [
  desp('d1', 'Frete rodoviario', 'BRL', '900', 'PESO_BRUTO'),
  desp('d2', 'Seguro internacional', 'USD', '150', 'VALOR_ADUANEIRO'),
  desp('d3', 'Armazenagem e capatazia', 'BRL', '2200', 'VOLUME'),
  desp('d4', 'Frete internacional', 'USD', '2500', 'PESO_BRUTO'),
  desp('d5', 'Taxa Siscomex', 'BRL', '115.67', 'VALOR_ADUANEIRO'),
  desp('d6', 'AFRMM (8% do frete)', 'BRL', '1005.54', 'PESO_BRUTO'),
  desp('d7', 'Despachante + SDA', 'BRL', '1800', 'VALOR_ADUANEIRO'),
]
const entrada = (va: [string | null, string | null, string | null]): LandedCostInput => ({
  schema_version: '1',
  processo: { id: 'proc-qa', loja_importadora_id: 'loja-qa', moeda_base: 'BRL' },
  politica: { escala_intermediaria: 10, escala_persistencia: 4, escala_unitario: 6, arredondamento: 'HALF_UP', ordem_residuo: 'MAIOR_RESTO_ITEM_ID_ASC' },
  cambios: [{ moeda: 'USD', taxa: '5.0277', fonte: 'MANUAL', data: '2026-10-21' }],
  itens: [item('item-a', '2000', '5000', '180', '0.8', va[0]), item('item-b', '9000', '2000', '200', '1.2', va[1]), item('item-c', '3200', '1000', '420', '2.5', va[2])],
  despesas: DESPESAS, descontos: [], tributos,
} as unknown as LandedCostInput)

describe('P1 — reprodução no motor', () => {
  it('sem VA: BLOQUEADO com VALOR_ADUANEIRO_AUSENTE nas 3 despesas por VA (seguro, Siscomex, despachante)', () => {
    const r = calcularLandedCost(entrada([null, null, null]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.status).toBe('BLOQUEADO')
    expect(r.value.divergencias.map((d) => [d.codigo, d.referencia]).sort()).toEqual([
      ['VALOR_ADUANEIRO_AUSENTE', 'd2'], ['VALOR_ADUANEIRO_AUSENTE', 'd5'], ['VALOR_ADUANEIRO_AUSENTE', 'd7'],
    ])
  })

  it('com o VA de comporValorAduaneiro (6 casas): OK, conservação, sem encargo duplicado', () => {
    const va = comporValorAduaneiro({
      itens: [{ id: 'item-a', moeda: 'USD', valor_mercadoria_moeda: '2000' }, { id: 'item-b', moeda: 'USD', valor_mercadoria_moeda: '9000' }, { id: 'item-c', moeda: 'USD', valor_mercadoria_moeda: '3200' }],
      cambios: usd, frete: [{ moeda: 'USD', valor: '2500' }], seguro: [{ moeda: 'USD', valor: '150' }],
    }).itens.map((x) => x.valor_aduaneiro_brl) as [string, string, string]
    const r = calcularLandedCost(entrada(va))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const s = r.value
    expect(s.status).toBe('OK')
    // Independente (Python, escala 10 + maior resto, HALF_UP 4): 23.388,7306 / 93.038,9168 / 39.932,3577
    expect(s.itens.map((x) => [x.custo_total_brl, x.custo_unitario_brl])).toEqual([
      ['23388.7306', '4.677746'], ['93038.9168', '46.519458'], ['39932.3577', '39.932358'],
    ])
    // Entradas: 71.393,34 + 900 + 754,155 + 2.200 + 12.569,25 + 115,67 + 1.005,54 + 1.800 + 65.622,05 (tributos) = 156.360,005
    expect(s.conservacao).toMatchObject({ ok: true, entradas_brl: '156360.0050', saidas_brl: '156360.0050' })
    // Cada encargo tem UMA origem rateada em 3 itens (sem duplicidade): 7 despesas × 3 itens = 21 linhas.
    expect(s.rateios.length).toBe(21)
    expect(s.rateios.filter((x) => x.origem_id === 'd6').map((x) => x.valor_alocado_brl)).toEqual(['226.2465000000', '251.3850000000', '527.9085000000'])
    expect(s.rateios.filter((x) => x.origem_id === 'd5').reduce((a, x) => a + Number(x.valor_alocado_brl), 0)).toBeCloseTo(115.67, 9)
  })

  it('com o VA gravado na operação real (centavos): reproduz a apuração v2 gravada', () => {
    // Saída gravada v2 (SELECT somente leitura): 23.388,7307 / 93.038,9166 / 39.932,3577; soma 156.360,0050.
    const r = calcularLandedCost(entrada(['11931.94', '53693.71', '19091.10']))
    expect(r.ok && r.value.itens.map((x) => x.custo_total_brl)).toEqual(['23388.7307', '93038.9166', '39932.3577'])
  })
})
