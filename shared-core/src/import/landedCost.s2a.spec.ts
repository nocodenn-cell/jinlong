/**
 * Sprint 2A, Etapa 1: pendências do motor.
 * GLOSADO com incorporação, bloqueio de aprovação e limites decimais / HALF_UP.
 * Valores calculados à mão, com a conta registrada em cada teste.
 */
import { describe, expect, it } from 'vitest'
import { calcularLandedCost } from './landedCost'
import { verificarAprovacao } from './aprovacao'
import { ENGINE_VERSION } from './landedCost'
import { parseDecimal, reescala, arredondaHalfUp } from './decimal'
import type { ItemEntrada, LandedCostInput, LandedResult, TributoEntrada } from './types'

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

const sucesso = (r: LandedResult) => {
  if (!r.ok) throw new Error(r.error.codigo)
  return r.value
}

const glosado = (over: Partial<TributoEntrada> = {}): TributoEntrada => ({
  id: 'trib-g1', tributo_codigo: 'CATALOGO', status_recuperabilidade: 'GLOSADO', valor_apurado_brl: '4.00',
  item_id: 'item-001',
  regra: { id: 'regra-g', incorpora_custo: true, vigencia_inicio: '2026-01-01', vigencia_fim: null },
  data_fato_gerador: '2026-03-15', validado_por: null, ...over,
})

describe('GLOSADO', () => {
  it('glosa com regra que manda incorporar entra no custo do item (10,00 + 4,00 = 14,00)', () => {
    const r = sucesso(calcularLandedCost(entrada({ tributos: [glosado()] })))
    expect(r.itens[0].componentes_brl.tributos_nao_recuperaveis).toBe('4.0000')
    expect(r.itens[0].custo_total_brl).toBe('14.0000')
    expect(r.itens[0].custo_unitario_brl).toBe('14.000000')
    expect(r.status).toBe('OK')
  })

  it('glosa com regra que NÃO manda incorporar fica fora do custo (10,00 permanece)', () => {
    const r = sucesso(calcularLandedCost(entrada({
      tributos: [glosado({ regra: { id: 'regra-g', incorpora_custo: false, vigencia_inicio: '2026-01-01', vigencia_fim: null } })],
    })))
    expect(r.itens[0].componentes_brl.tributos_nao_recuperaveis).toBe('0.0000')
    expect(r.itens[0].custo_total_brl).toBe('10.0000')
  })

  it('glosa incorporada sem item é erro de alocação', () => {
    const r = calcularLandedCost(entrada({ tributos: [glosado({ item_id: null })] }))
    expect(r.ok ? 'OK' : r.error.codigo).toBe('LANDED_TRIBUTO_ALOCACAO_AUSENTE')
  })

  it('glosa fora da vigência não incorpora e gera divergência bloqueante', () => {
    const r = sucesso(calcularLandedCost(entrada({ tributos: [glosado({ data_fato_gerador: '2025-12-31' })] })))
    expect(r.itens[0].custo_total_brl).toBe('10.0000')
    expect(r.divergencias.map((d) => d.codigo)).toEqual(['TRIBUTO_REGRA_FORA_VIGENCIA'])
    expect(r.status).toBe('BLOQUEADO')
  })
})

describe('verificarAprovacao: cálculo bloqueado não é aprovável', () => {
  it('cálculo OK e sem divergência é aprovável', () => {
    const v = verificarAprovacao(calcularLandedCost(entrada()))
    expect(v).toEqual({ aprovavel: true, motivos: [] })
  })

  it('tributo pendente bloqueia a aprovação', () => {
    const pendente: TributoEntrada = {
      id: 't1', tributo_codigo: 'X', status_recuperabilidade: 'PENDENTE_VALIDACAO', valor_apurado_brl: '2.00',
      item_id: null, regra: null, data_fato_gerador: null, validado_por: null,
    }
    const v = verificarAprovacao(calcularLandedCost(entrada({ tributos: [pendente] })))
    expect(v.aprovavel).toBe(false)
    expect(v.motivos).toEqual(['STATUS_BLOQUEADO', 'DIVERGENCIA_BLOQUEANTE'])
  })

  it('decisão de incorporação pendente bloqueia a aprovação', () => {
    const v = verificarAprovacao(calcularLandedCost(entrada({
      despesas: [{
        id: 'd1', tipo: 'FRETE', moeda: 'BRL', valor: '5.00', incorporavel: 'DECISAO_03',
        atribuicao: { modo: 'DIRETA', item_id: 'item-001', justificativa: 'Frete exclusivo deste item' },
      }],
    })))
    expect(v.aprovavel).toBe(false)
    expect(v.motivos).toContain('DIVERGENCIA_BLOQUEANTE')
  })

  it('erro de entrada nunca é aprovável', () => {
    const v = verificarAprovacao(calcularLandedCost(entrada({ itens: [item({ quantidade_estoque: '2.000' })] })))
    expect(v).toEqual({ aprovavel: false, motivos: ['CALCULO_COM_ERRO'] })
  })

  it('saída de versão diferente do motor não é aprovável', () => {
    const r = calcularLandedCost(entrada())
    if (!r.ok) throw new Error('setup')
    const adulterado: LandedResult = { ok: true, value: { ...r.value, engine_version: 'landed-cost/0.0.0' } }
    expect(verificarAprovacao(adulterado).motivos).toEqual(['VERSAO_MOTOR_DIFERENTE'])
    expect(verificarAprovacao(adulterado).aprovavel).toBe(false)
    expect(ENGINE_VERSION).toBe('landed-cost/0.1.0')
  })

  it('saída com conservação falsa não é aprovável, mesmo com status OK', () => {
    const r = calcularLandedCost(entrada())
    if (!r.ok) throw new Error('setup')
    const adulterado: LandedResult = {
      ok: true,
      value: { ...r.value, conservacao: { ...r.value.conservacao, ok: false, diferenca_brl: '0.0000000001' } },
    }
    expect(verificarAprovacao(adulterado).motivos).toEqual(['CONSERVACAO_FALHOU'])
  })
})

describe('limites decimais por campo', () => {
  it('taxa aceita exatamente 10 casas', () => {
    expect(parseDecimal('0.0000000001', 10)).toBe(1n)
    const r = sucesso(calcularLandedCost(entrada({
      cambios: [{ moeda: 'USD', taxa: '0.0000000001', fonte: 'MANUAL', data: '2026-01-01' }],
      itens: [item({ moeda: 'USD', valor_mercadoria_moeda: '1000000.000000' })],
    })))
    // 1 000 000 × 0,0000000001 = 0,0001 BRL
    expect(r.itens[0].custo_total_brl).toBe('0.0001')
  })

  it('dinheiro aceita exatamente 6 casas e rejeita a sétima', () => {
    const ok = sucesso(calcularLandedCost(entrada({ itens: [item({ valor_mercadoria_moeda: '0.000001' })] })))
    expect(ok.itens[0].custo_total_brl).toBe('0.0000')
    const r = calcularLandedCost(entrada({ itens: [item({ valor_mercadoria_moeda: '0.0000001' })] }))
    expect(r.ok ? 'OK' : r.error.codigo).toBe('LANDED_DECIMAL_ESCALA_EXCEDIDA')
  })

  it('valor de imposto aceita 2 casas e rejeita a terceira', () => {
    const r = calcularLandedCost(entrada({
      tributos: [{
        id: 't', tributo_codigo: 'X', status_recuperabilidade: 'RECUPERAVEL_POTENCIAL', valor_apurado_brl: '1.001',
        item_id: null, regra: null, data_fato_gerador: null, validado_por: null,
      }],
    }))
    expect(r.ok ? 'OK' : r.error.codigo).toBe('LANDED_DECIMAL_ESCALA_EXCEDIDA')
  })

  it('quantidade aceita 3 casas e rejeita a quarta', () => {
    const r = calcularLandedCost(entrada({ itens: [item({ quantidade_comercial: '1.0001' })] }))
    expect(r.ok ? 'OK' : r.error.codigo).toBe('LANDED_DECIMAL_ESCALA_EXCEDIDA')
  })

  it('fator aceita 6 casas', () => {
    const r = sucesso(calcularLandedCost(entrada({
      itens: [item({ valor_mercadoria_moeda: '1.000000', fator_para_estoque: '0.000001', quantidade_comercial: '1000000.000', quantidade_estoque: '1.000' })],
    })))
    // 1 ÷ 1 = 1 unidade; unitário = 1 ÷ 1 = 1,000000
    expect(r.itens[0].custo_unitario_brl).toBe('1.000000')
  })
})

describe('arredondamento HALF_UP nos limites', () => {
  it('empate exato em 0,5 sobe em módulo, nos dois sinais', () => {
    expect(arredondaHalfUp(5n, 10n)).toBe(1n) // 0,5 → 1
    expect(arredondaHalfUp(-5n, 10n)).toBe(-1n) // −0,5 → −1
    expect(arredondaHalfUp(15n, 10n)).toBe(2n) // 1,5 → 2
    expect(arredondaHalfUp(-15n, 10n)).toBe(-2n)
  })

  it('nove noves abaixo do empate não sobem', () => {
    // 0,4999999999 com 0 casas → 0
    expect(reescala(4999999999n, 10, 0)).toBe(0n)
  })

  it('empate na escala de persistência do total sobe (0,00005 → 0,0001)', () => {
    const r = sucesso(calcularLandedCost(entrada({ itens: [item({ valor_mercadoria_moeda: '0.000050' })] })))
    expect(r.itens[0].custo_total_brl).toBe('0.0001')
  })

  it('componente negativo com empate: −0,00005 de despesa persiste como −0,0001 (longe de zero)', () => {
    const r = sucesso(calcularLandedCost(entrada({
      itens: [item({ valor_mercadoria_moeda: '10.000000' })],
      despesas: [{
        id: 'd1', tipo: 'AJUSTE', moeda: 'BRL', valor: '-0.000050', incorporavel: true,
        atribuicao: { modo: 'DIRETA', item_id: 'item-001', justificativa: 'Ajuste de centavos para teste de arredondamento' },
      }],
    })))
    // 10 − 0,00005 = 9,99995 → total 4 casas: 10,0000 (empate sobe)
    expect(r.itens[0].custo_total_brl).toBe('10.0000')
    // componente −0,00005 → −0,0001 (HALF_UP longe de zero)
    expect(r.itens[0].componentes_brl.despesas_incorporadas).toBe('-0.0001')
  })

  it('total negativo nunca é persistido: vira erro CUSTO_NEGATIVO', () => {
    const r = calcularLandedCost(entrada({
      itens: [item({ valor_mercadoria_moeda: '0.000050' })],
      descontos: [{ id: 'd1', escopo: 'ITEM', moeda: 'BRL', valor: '0.000100', item_id: 'item-001', justificativa: 'Desconto de centavos para teste de arredondamento' }],
    }))
    expect(r.ok ? 'OK' : r.error.codigo).toBe('LANDED_CUSTO_NEGATIVO')
  })
})
