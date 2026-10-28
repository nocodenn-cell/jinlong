import { describe, expect, it } from 'vitest'
import { basesNacionais, composicaoValorAduaneiro, conciliarEncargosAduaneiros } from './inteligencia'
import type { Despesa, Item } from './dadosImportacoes'

/** Cenário real (câmbio 5,0277): esperados à mão em shared-core/src/import/valorAduaneiro.spec.ts. */
const item = (id: string, usd: string, va: string | null = null): Item => ({
  id, descricao: id, codigo_fornecedor: null, ncm: '85161000', produto_id: null, moeda: 'USD', valor_mercadoria_moeda: usd,
  valor_aduaneiro_brl: va, quantidade_comercial: '1', unidade_comercial: 'UN', fator_para_estoque: '1', quantidade_estoque: '1',
  peso_liquido_kg: null, peso_bruto_kg: null, volume_m3: null,
})
const itens = [item('i1', '2000'), item('i2', '9000'), item('i3', '3200')]
const cambios = [{ id: 'c', moeda: 'USD', taxa: '5.0277', fonte: 'PTAX', data: '2026-10-21' }]
const d = (id: string, tipo: string, valor: string, moeda = 'USD'): Despesa => ({ id, tipo, moeda, valor, incorporavel: 'SIM', atribuicao_modo: 'RATEIO',
  item_id: null, criterio: null, justificativa: '', status_conferencia: 'PENDENTE', documento_id: null })
const base = [d('f', 'Frete internacional', '2500'), d('s', 'Seguro internacional', '150')]
const nac = (despesas: Despesa[]) => ({ despesas, maritimo: true, regime: 'SIMPLES' as const })

describe('VA canônico na ponte', () => {
  it('cenário real: VA por item = FOB+frete+seguro rateados por FOB (rateio exato)', () => {
    const b = basesNacionais(itens, cambios, nac(base))
    expect(b.ok.map((x) => x.valor_aduaneiro_brl)).toEqual(['11931.935916', '53693.711619', '19091.097465'])
    expect(b.resumo).toMatchObject({ frete_brl: '12569.25', seguro_brl: '754.16', afrmm_brl: '1005.54', siscomex_brl: '115.67' })
  })

  it('regressão: despesa "AFRMM (8% do frete)" NÃO entra no VA como frete', () => {
    const comAfrmm = basesNacionais(itens, cambios, nac([...base, d('a', 'AFRMM (8% do frete)', '1005.54', 'BRL')]))
    expect(comAfrmm.ok.map((x) => x.valor_aduaneiro_brl)).toEqual(['11931.935916', '53693.711619', '19091.097465'])
    expect(comAfrmm.resumo.frete_brl).toBe('12569.25')
    const comSiscomex = basesNacionais(itens, cambios, nac([...base, d('x', 'Taxa Siscomex (frete DI)', '115.67', 'BRL')]))
    expect(comSiscomex.resumo.frete_brl).toBe('12569.25')
  })

  it('composição exposta para a UI/ação: VA informado é mantido e marcado', () => {
    const c = composicaoValorAduaneiro([item('i1', '2000', '11931.94'), item('i2', '9000'), item('i3', '3200')], cambios, base)
    expect(c.itens.map((x) => [x.item_id, x.valor_aduaneiro_brl, x.informado_brl])).toEqual([
      ['i1', '11931.935916', '11931.94'], ['i2', '53693.711619', null], ['i3', '19091.097465', null],
    ])
    expect(c.semValorInformado).toEqual(['i2', 'i3'])
    expect(c.totais.valor_aduaneiro_brl).toBe('84716.745000')
  })
})

describe('P2 — conciliação AFRMM/Siscomex (base do ICMS × despesas lançadas)', () => {
  it('sem lançamentos: 1.005,54 + 115,67 = 1.121,21 ausentes do custo', () => {
    expect(conciliarEncargosAduaneiros(base, cambios, true)).toEqual({
      afrmm_icms: '1005.54', siscomex_icms: '115.67', afrmm_lancado: '0.00', siscomex_lancado: '0.00', ausente_no_custo_brl: '1121.21', duplicado: false,
    })
  })
  it('com lançamentos manuais iguais: nada ausente e sem duplicidade', () => {
    const r = conciliarEncargosAduaneiros([...base, d('a', 'AFRMM (8% do frete)', '1005.54', 'BRL'), d('x', 'Taxa Siscomex', '115.67', 'BRL')], cambios, true)
    expect(r).toEqual({ afrmm_icms: '1005.54', siscomex_icms: '115.67', afrmm_lancado: '1005.54', siscomex_lancado: '115.67', ausente_no_custo_brl: '0.00', duplicado: false })
  })
  it('dois lançamentos de AFRMM: duplicado', () => {
    const r = conciliarEncargosAduaneiros([...base, d('a', 'AFRMM', '1005.54', 'BRL'), d('b', 'Marinha Mercante', '1005.54', 'BRL')], cambios, true)
    expect(r.duplicado).toBe(true)
    expect(r.ausente_no_custo_brl).toBe('115.67')
  })
})

describe('revisão PR #624 — despesa mista (frete E seguro) não é contada nem omitida em silêncio', () => {
  // FOB USD 1000 × câmbio 5,0 = R$ 5000. Despesa única de USD 20 com nome ambíguo.
  // Atribuir a um dos dois componentes inventaria valor; ignorá-la omitiria valor. Sinaliza-se a pendência.
  const cam5 = [{ id: 'c5', moeda: 'USD', taxa: '5.0', fonte: 'PTAX', data: '2026-10-21' }]
  const um = [item('u1', '1000')]
  it.each(['Freight insurance', 'Frete + seguro internacional', 'Seguro do frete internacional'])('"%s" → pendência DESPESA_MISTA, sem valor em frete/seguro', (tipo) => {
    const c = composicaoValorAduaneiro(um, cam5, [d('x', tipo, '20')])
    expect(c.pendencias).toContain('DESPESA_MISTA')
    expect(Number(c.totais.frete_brl)).toBe(0)
    expect(Number(c.totais.seguro_brl)).toBe(0)
    expect(Number(c.totais.valor_aduaneiro_brl)).toBe(5000)
  })
  it('controle: seguro puro e frete puro seguem separados, sem pendência', () => {
    const c = composicaoValorAduaneiro(um, cam5, [d('s', 'Seguro internacional', '20'), d('f', 'Frete internacional', '10')])
    expect(c.pendencias).toEqual([])
    expect(Number(c.totais.seguro_brl)).toBe(100)
    expect(Number(c.totais.frete_brl)).toBe(50)
    expect(Number(c.totais.valor_aduaneiro_brl)).toBe(5150)
  })
})
