/**
 * Testes adversariais do motor. Valores calculados à mão (não extraídos dos fixtures).
 * Cada expectativa traz a conta que a justifica.
 */
import { describe, expect, it } from 'vitest'
import { calcularLandedCost } from './landedCost'
import type { ItemEntrada, LandedCostInput, LandedResult, TributoEntrada, DespesaEntrada, DescontoEntrada } from './types'

const item = (over: Partial<ItemEntrada> = {}): ItemEntrada => ({
  id: 'item-001', produto_id: 'prod-001', moeda: 'BRL', valor_mercadoria_moeda: '10.000000',
  valor_aduaneiro_brl: null, quantidade_comercial: '1.000', unidade_comercial: 'UN',
  fator_para_estoque: '1.000000', quantidade_estoque: '1.000',
  peso_liquido_kg: '1.000', peso_bruto_kg: '1.000', volume_m3: '0.010', ...over,
})

const entrada = (over: Partial<LandedCostInput> = {}): LandedCostInput => ({
  schema_version: '1',
  processo: { id: 'proc-1', loja_importadora_id: 'loja-1', moeda_base: 'BRL' },
  politica: {
    escala_intermediaria: 10, escala_persistencia: 4, escala_unitario: 6,
    arredondamento: 'HALF_UP', ordem_residuo: 'MAIOR_RESTO_ITEM_ID_ASC',
  },
  cambios: [], itens: [item()], despesas: [], descontos: [], tributos: [], ...over,
})

const just = 'Justificativa suficientemente longa para o teste'

function sucesso(r: LandedResult) {
  if (!r.ok) throw new Error(`esperava sucesso, veio ${r.error.codigo}`)
  return r.value
}
const codigo = (r: LandedResult): string => (r.ok ? 'SEM_ERRO' : r.error.codigo)

describe('unidades fracionadas e unitário', () => {
  it('1,000 ÷ 0,999: unitário 1,001001 e resíduo unitário 0,0000000010 (conta: 10^10 − 1001001×999×10)', () => {
    const r = sucesso(calcularLandedCost(entrada({
      itens: [item({ valor_mercadoria_moeda: '1.000000', quantidade_comercial: '0.333', fator_para_estoque: '3.000000', quantidade_estoque: '0.999' })],
    })))
    expect(r.itens[0].custo_total_brl).toBe('1.0000')
    expect(r.itens[0].custo_unitario_brl).toBe('1.001001')
    expect(r.itens[0].residuo_unitario_brl).toBe('0.0000000010')
    expect(r.itens[0].residuo_total_brl).toBe('0.0000000000')
  })
})

describe('arredondamento HALF_UP nos limites', () => {
  it('total 0,000050 com 4 casas: empate sobe para 0,0001; resíduo total −0,0000500000', () => {
    const r = sucesso(calcularLandedCost(entrada({
      itens: [item({ valor_mercadoria_moeda: '0.000050' })],
    })))
    expect(r.itens[0].custo_total_brl).toBe('0.0001')
    expect(r.itens[0].custo_unitario_brl).toBe('0.000050')
    expect(r.itens[0].residuo_unitario_brl).toBe('0.0000000000')
    expect(r.itens[0].residuo_total_brl).toBe('-0.0000500000')
  })
})

describe('valores negativos', () => {
  it('ajuste negativo em despesa é permitido e reduz o custo', () => {
    const despesa: DespesaEntrada = {
      id: 'desp-1', tipo: 'AJUSTE', moeda: 'BRL', valor: '-5.00', incorporavel: true,
      atribuicao: { modo: 'DIRETA', item_id: 'item-001', justificativa: 'Estorno de armazenagem cobrada em duplicidade' },
    }
    const r = sucesso(calcularLandedCost(entrada({
      itens: [item({ valor_mercadoria_moeda: '100.000000' })], despesas: [despesa],
    })))
    expect(r.itens[0].componentes_brl.despesas_incorporadas).toBe('-5.0000')
    expect(r.itens[0].custo_total_brl).toBe('95.0000')
    expect(r.itens[0].custo_unitario_brl).toBe('95.000000')
  })

  it('valor de mercadoria negativo é erro', () => {
    expect(codigo(calcularLandedCost(entrada({ itens: [item({ valor_mercadoria_moeda: '-1.000000' })] }))))
      .toBe('LANDED_VALOR_NEGATIVO')
  })

  it('desconto negativo é erro: o sinal de redução é do motor', () => {
    const desc: DescontoEntrada = { id: 'd1', escopo: 'ITEM', moeda: 'BRL', valor: '-1.000000', item_id: 'item-001', justificativa: just }
    expect(codigo(calcularLandedCost(entrada({ descontos: [desc] })))).toBe('LANDED_VALOR_NEGATIVO')
  })

  it('desconto maior que o valor do item gera custo negativo: erro', () => {
    const desc: DescontoEntrada = { id: 'd1', escopo: 'ITEM', moeda: 'BRL', valor: '20.000000', item_id: 'item-001', justificativa: just }
    expect(codigo(calcularLandedCost(entrada({ descontos: [desc] })))).toBe('LANDED_CUSTO_NEGATIVO')
  })

  it('valor aduaneiro negativo é erro', () => {
    expect(codigo(calcularLandedCost(entrada({ itens: [item({ valor_aduaneiro_brl: '-1.000000' })] }))))
      .toBe('LANDED_VALOR_NEGATIVO')
  })
})

describe('limites de magnitude e de escala', () => {
  it('logo abaixo de 10^12 é aceito; o total é arredondado para 1000000000000.0000', () => {
    const r = sucesso(calcularLandedCost(entrada({
      itens: [item({ valor_mercadoria_moeda: '999999999999.999999' })],
    })))
    expect(r.itens[0].custo_total_brl).toBe('1000000000000.0000')
    expect(r.itens[0].residuo_total_brl).toBe('-0.0000010000')
  })

  it('10^12 ou mais na entrada é erro de limite', () => {
    expect(codigo(calcularLandedCost(entrada({ itens: [item({ valor_mercadoria_moeda: '1000000000000.000000' })] }))))
      .toBe('LANDED_LIMITE_EXCEDIDO')
  })

  it('taxa com 11 casas é erro de escala', () => {
    expect(codigo(calcularLandedCost(entrada({
      cambios: [{ moeda: 'USD', taxa: '5.43210000001', fonte: 'MANUAL', data: '2026-09-30' }],
      itens: [item({ moeda: 'USD' })],
    })))).toBe('LANDED_DECIMAL_ESCALA_EXCEDIDA')
  })

  it('valor com sinal de mais é erro de formato', () => {
    expect(codigo(calcularLandedCost(entrada({ itens: [item({ valor_mercadoria_moeda: '+10.000000' })] }))))
      .toBe('LANDED_DECIMAL_FORMATO')
  })
})

describe('validações de entrada', () => {
  it('quantidade zero, fator zero e quantidade de estoque zero são erros', () => {
    expect(codigo(calcularLandedCost(entrada({ itens: [item({ quantidade_comercial: '0.000' })] })))).toBe('LANDED_QTD_INVALIDA')
    expect(codigo(calcularLandedCost(entrada({ itens: [item({ fator_para_estoque: '0.000000' })] })))).toBe('LANDED_FATOR_INVALIDO')
    expect(codigo(calcularLandedCost(entrada({ itens: [item({ quantidade_estoque: '0.000' })] })))).toBe('LANDED_QTD_INVALIDA')
  })

  it('quantidade de estoque diferente de comercial × fator é erro', () => {
    expect(codigo(calcularLandedCost(entrada({
      itens: [item({ quantidade_comercial: '2.000', fator_para_estoque: '3.500000', quantidade_estoque: '7.001' })],
    })))).toBe('LANDED_QTD_FATOR_INCONSISTENTE')
  })

  it('comercial × fator exato é aceito (2,000 × 3,500 = 7,000)', () => {
    const r = sucesso(calcularLandedCost(entrada({
      itens: [item({ quantidade_comercial: '2.000', fator_para_estoque: '3.500000', quantidade_estoque: '7.000', valor_mercadoria_moeda: '70.000000' })],
    })))
    expect(r.itens[0].custo_unitario_brl).toBe('10.000000')
  })

  it('id de item repetido é erro', () => {
    expect(codigo(calcularLandedCost(entrada({ itens: [item(), item()] })))).toBe('LANDED_ID_DUPLICADO')
  })

  it('moeda sem câmbio é erro, também em despesa', () => {
    const d: DespesaEntrada = {
      id: 'd1', tipo: 'FRETE', moeda: 'USD', valor: '10.000000', incorporavel: true,
      atribuicao: { modo: 'DIRETA', item_id: 'item-001', justificativa: just },
    }
    expect(codigo(calcularLandedCost(entrada({ despesas: [d] })))).toBe('LANDED_CAMBIO_AUSENTE')
  })

  it('câmbio para BRL, câmbio duplicado e taxa zero são erros', () => {
    expect(codigo(calcularLandedCost(entrada({ cambios: [{ moeda: 'BRL', taxa: '1.0000000000', fonte: 'MANUAL', data: '2026-01-01' }] }))))
      .toBe('LANDED_CAMBIO_INVALIDO')
    const usd = { moeda: 'USD', taxa: '5.0000000000', fonte: 'MANUAL' as const, data: '2026-01-01' }
    expect(codigo(calcularLandedCost(entrada({ cambios: [usd, usd] })))).toBe('LANDED_CAMBIO_DUPLICADO')
    expect(codigo(calcularLandedCost(entrada({ cambios: [{ ...usd, taxa: '0.0000000000' }] })))).toBe('LANDED_CAMBIO_INVALIDO')
  })

  it('justificativa só com espaços é erro', () => {
    const d: DespesaEntrada = {
      id: 'd1', tipo: 'FRETE', moeda: 'BRL', valor: '1.000000', incorporavel: true,
      atribuicao: { modo: 'DIRETA', item_id: 'item-001', justificativa: '           ' },
    }
    expect(codigo(calcularLandedCost(entrada({ despesas: [d] })))).toBe('LANDED_JUSTIFICATIVA_AUSENTE')
  })

  it('despesa direta para item inexistente é erro', () => {
    const d: DespesaEntrada = {
      id: 'd1', tipo: 'FRETE', moeda: 'BRL', valor: '1.000000', incorporavel: true,
      atribuicao: { modo: 'DIRETA', item_id: 'nao-existe', justificativa: just },
    }
    expect(codigo(calcularLandedCost(entrada({ despesas: [d] })))).toBe('LANDED_ITEM_INEXISTENTE')
  })

  it('política diferente da aprovada (HALF_EVEN) é erro', () => {
    const e = entrada()
    expect(codigo(calcularLandedCost({ ...e, politica: { ...e.politica, arredondamento: 'HALF_EVEN' as 'HALF_UP' } })))
      .toBe('LANDED_POLITICA_INVALIDA')
  })

  it('moeda base diferente de BRL é erro', () => {
    const e = entrada()
    expect(codigo(calcularLandedCost({ ...e, processo: { ...e.processo, moeda_base: 'USD' as 'BRL' } }))).toBe('LANDED_MOEDA_BASE')
  })
})

describe('despesas não incorporadas e rateio com base zero', () => {
  it('despesa com incorporavel = false não entra no custo e aparece na lista', () => {
    const d: DespesaEntrada = {
      id: 'd1', tipo: 'OUTRA', moeda: 'BRL', valor: '50.000000', incorporavel: false,
      atribuicao: { modo: 'DIRETA', item_id: 'item-001', justificativa: just },
    }
    const r = sucesso(calcularLandedCost(entrada({ despesas: [d] })))
    expect(r.despesas_nao_incorporadas).toEqual(['d1'])
    expect(r.itens[0].custo_total_brl).toBe('10.0000')
    expect(r.rateios).toEqual([])
  })

  it('rateio por volume com todos os volumes zero é erro, sem fallback', () => {
    const d: DespesaEntrada = {
      id: 'd1', tipo: 'ARMAZENAGEM', moeda: 'BRL', valor: '10.000000', incorporavel: true,
      atribuicao: { modo: 'RATEIO', criterio: 'VOLUME', justificativa: just },
    }
    expect(codigo(calcularLandedCost(entrada({ itens: [item({ volume_m3: '0.000' })], despesas: [d] }))))
      .toBe('LANDED_RATEIO_BASE_ZERO')
  })
})

describe('tributos', () => {
  const tributo = (over: Partial<TributoEntrada>): TributoEntrada => ({
    id: 't1', tributo_codigo: 'CATALOGO', status_recuperabilidade: 'NAO_RECUPERAVEL', valor_apurado_brl: '25.50',
    item_id: 'item-001', regra: { id: 'r1', incorpora_custo: true, vigencia_inicio: '2026-01-01', vigencia_fim: '2026-06-30' },
    data_fato_gerador: '2026-03-15', validado_por: null, ...over,
  })

  it('fato gerador no último dia da vigência (fim inclusivo) incorpora', () => {
    const r = sucesso(calcularLandedCost(entrada({ tributos: [tributo({ data_fato_gerador: '2026-06-30' })] })))
    expect(r.itens[0].componentes_brl.tributos_nao_recuperaveis).toBe('25.5000')
    expect(r.status).toBe('OK')
  })

  it('fato gerador no primeiro dia da vigência (início inclusivo) incorpora', () => {
    const r = sucesso(calcularLandedCost(entrada({ tributos: [tributo({ data_fato_gerador: '2026-01-01' })] })))
    expect(r.itens[0].componentes_brl.tributos_nao_recuperaveis).toBe('25.5000')
  })

  it('fato gerador fora da vigência: excluído com divergência bloqueante', () => {
    const r = sucesso(calcularLandedCost(entrada({ tributos: [tributo({ data_fato_gerador: '2026-07-01' })] })))
    expect(r.itens[0].componentes_brl.tributos_nao_recuperaveis).toBe('0.0000')
    expect(r.divergencias.map((d) => d.codigo)).toEqual(['TRIBUTO_REGRA_FORA_VIGENCIA'])
    expect(r.status).toBe('BLOQUEADO')
  })

  it('regra sem início de vigência é erro', () => {
    expect(codigo(calcularLandedCost(entrada({
      tributos: [tributo({ regra: { id: 'r1', incorpora_custo: true, vigencia_inicio: '', vigencia_fim: null } })],
    })))).toBe('LANDED_REGRA_VIGENCIA_AUSENTE')
  })

  it('regra sem data do fato gerador é erro de dado ausente', () => {
    expect(codigo(calcularLandedCost(entrada({ tributos: [tributo({ data_fato_gerador: null })] }))))
      .toBe('LANDED_DADO_AUSENTE')
  })

  it('tributo incorporado sem item é erro', () => {
    expect(codigo(calcularLandedCost(entrada({ tributos: [tributo({ item_id: null })] }))))
      .toBe('LANDED_TRIBUTO_ALOCACAO_AUSENTE')
  })

  it('crédito potencial não entra no custo; vai para o total de créditos', () => {
    const r = sucesso(calcularLandedCost(entrada({
      tributos: [tributo({ status_recuperabilidade: 'RECUPERAVEL_POTENCIAL', regra: null, data_fato_gerador: null, item_id: null, valor_apurado_brl: '10.00' })],
    })))
    expect(r.itens[0].custo_total_brl).toBe('10.0000')
    expect(r.creditos.potencial_brl).toBe('10.0000')
    expect(r.creditos.reconhecido_brl).toBe('0.0000')
  })

  it('crédito reconhecido exige quem validou', () => {
    expect(codigo(calcularLandedCost(entrada({
      tributos: [tributo({ status_recuperabilidade: 'RECUPERAVEL_RECONHECIDO', regra: null, data_fato_gerador: null, item_id: null, validado_por: null })],
    })))).toBe('LANDED_VALIDACAO_AUSENTE')
  })

  it('crédito reconhecido com validador: fora do custo, dentro dos créditos', () => {
    const r = sucesso(calcularLandedCost(entrada({
      tributos: [tributo({ status_recuperabilidade: 'RECUPERAVEL_RECONHECIDO', regra: null, data_fato_gerador: null, item_id: null, validado_por: 'contador-01', valor_apurado_brl: '25.50' })],
    })))
    expect(r.creditos.reconhecido_brl).toBe('25.5000')
    expect(r.itens[0].custo_total_brl).toBe('10.0000')
  })

  it('pendente de validação gera divergência, mesmo com regra ausente', () => {
    const r = sucesso(calcularLandedCost(entrada({
      tributos: [tributo({ status_recuperabilidade: 'PENDENTE_VALIDACAO', regra: null, data_fato_gerador: null })],
    })))
    expect(r.divergencias.map((d) => d.codigo)).toEqual(['TRIBUTO_PENDENTE'])
    expect(r.status).toBe('BLOQUEADO')
  })

  it('status desconhecido é erro', () => {
    expect(codigo(calcularLandedCost(entrada({
      tributos: [tributo({ status_recuperabilidade: 'FOO' as 'PENDENTE_VALIDACAO', regra: null, data_fato_gerador: null })],
    })))).toBe('LANDED_TRIBUTO_STATUS_INVALIDO')
  })
})

describe('determinismo e pureza', () => {
  const base15 = (): LandedCostInput => entrada({
    cambios: [{ moeda: 'USD', taxa: '5.4321000000', fonte: 'DECLARADA_DI', data: '2026-09-30' }],
    itens: [
      item({ id: 'item-001', moeda: 'USD', valor_mercadoria_moeda: '1200.000000', valor_aduaneiro_brl: '6518.520000', quantidade_comercial: '120.000', fator_para_estoque: '12.000000', quantidade_estoque: '1440.000', peso_bruto_kg: '104.000', peso_liquido_kg: '96.000', volume_m3: '0.420' }),
      item({ id: 'item-002', produto_id: 'prod-002', valor_mercadoria_moeda: '50.000000', peso_bruto_kg: '10.000', peso_liquido_kg: '8.000', volume_m3: '0.100', quantidade_comercial: '2.000', quantidade_estoque: '2.000' }),
      item({ id: 'item-003', produto_id: 'prod-003', valor_mercadoria_moeda: '70.000000', peso_bruto_kg: '20.000', peso_liquido_kg: '18.000', volume_m3: '0.300', quantidade_comercial: '3.000', quantidade_estoque: '3.000' }),
    ],
    despesas: [
      { id: 'desp-01', tipo: 'FRETE', moeda: 'USD', valor: '300.000000', incorporavel: true, atribuicao: { modo: 'RATEIO', criterio: 'PESO_BRUTO', justificativa: just } },
      { id: 'desp-02', tipo: 'ARM', moeda: 'BRL', valor: '180.00', incorporavel: true, atribuicao: { modo: 'RATEIO', criterio: 'VOLUME', justificativa: just } },
      { id: 'desp-03', tipo: 'OUTRA', moeda: 'BRL', valor: '7.00', incorporavel: true, atribuicao: { modo: 'RATEIO', criterio: 'QUANTIDADE_ESTOQUE', justificativa: just } },
    ],
    descontos: [{ id: 'desc-01', escopo: 'PROCESSO', moeda: 'USD', valor: '50.000000', criterio: 'VALOR_ADUANEIRO', justificativa: just }],
  })

  it('ordem das listas de entrada não altera a saída', () => {
    const referencia = calcularLandedCost(base15())
    let semente = 12345
    const aleatorio = () => {
      semente = (semente * 1103515245 + 12345) & 0x7fffffff
      return semente / 0x7fffffff
    }
    const embaralha = <T,>(lista: readonly T[]): T[] => {
      const c = [...lista]
      for (let i = c.length - 1; i > 0; i--) {
        const j = Math.floor(aleatorio() * (i + 1))
        ;[c[i], c[j]] = [c[j], c[i]]
      }
      return c
    }
    for (let k = 0; k < 30; k++) {
      const e = base15()
      const embaralhada = { ...e, itens: embaralha(e.itens), despesas: embaralha(e.despesas), descontos: embaralha(e.descontos) }
      expect(calcularLandedCost(embaralhada)).toEqual(referencia)
    }
  })

  it('não altera a entrada', () => {
    const e = base15()
    const copia = JSON.parse(JSON.stringify(e))
    calcularLandedCost(e)
    expect(e).toEqual(copia)
  })

  it('a soma dos rateios é exatamente a despesa e o desconto (conservação por construção)', () => {
    const r = sucesso(calcularLandedCost(base15()))
    const somaDespesas = r.rateios.filter((x) => x.componente === 'despesas' && x.origem_id === 'desp-01')
      .reduce((s, x) => s + BigInt(x.valor_alocado_brl.replace('.', '')), 0n)
    expect(somaDespesas).toBe(BigInt('1629.6300000000'.replace('.', '')))
    expect(r.conservacao.ok).toBe(true)
    expect(r.conservacao.diferenca_brl).toBe('0.0000000000')
  })
})

describe('compatibilidade futura com PostgreSQL (formato numeric)', () => {
  it('valores de saída têm exatamente a escala de persistência e cabem em numeric(18,n)', () => {
    const r = sucesso(calcularLandedCost(entrada({
      itens: [item({ valor_mercadoria_moeda: '123456789.123456', quantidade_comercial: '7.000', quantidade_estoque: '7.000', fator_para_estoque: '1.000000' })],
    })))
    const it0 = r.itens[0]
    expect(it0.custo_total_brl).toMatch(/^-?\d+\.\d{4}$/)
    expect(it0.custo_unitario_brl).toMatch(/^-?\d+\.\d{6}$/)
    expect(it0.residuo_unitario_brl).toMatch(/^-?\d+\.\d{10}$/)
    // numeric(18,4): até 14 dígitos inteiros
    expect(it0.custo_total_brl.replace('-', '').split('.')[0].length).toBeLessThanOrEqual(14)
  })

  it('residuo_total de unitário e total também respeitam escala de persistência', () => {
    const r = sucesso(calcularLandedCost(entrada({ itens: [item({ valor_mercadoria_moeda: '1.234567' })] })))
    expect(r.itens[0].custo_total_brl).toBe('1.2346')
    // 1,234567 − 1,2346 = −0,000033
    expect(r.itens[0].residuo_total_brl).toBe('-0.0000330000')
  })
})
