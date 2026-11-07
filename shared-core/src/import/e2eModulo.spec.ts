/** Bateria de aceite do módulo de importação (dados fictícios). */
import { describe, expect, it } from 'vitest'
import { apurarImportacao } from './regime'
import { montarCatalogoNacional, simularRevendaInterestadual, ALIQUOTAS_UF, parametroIcmsUf, aliquotaDaUf } from './catalogoNacional'
import { calcularLandedCost } from './landedCost'
import { simularPreco } from './precificacao'

const ex = { fob_brl: '54000', frete_brl: '5400', seguro_brl: '540', maritimo: true, siscomex_brl: '115.67',
  ii_pct: '18', ipi_pct: '10', pis_pct: '2.10', cofins_pct: '9.65', icms_pct: '20.5' }

describe('aceite', () => {
  it('T1 ICMS por UF (PE, SP, SC, ES)', () => {
    const icms = (uf: string) => montarCatalogoNacional({ uf }).find((p) => p.tributo === 'ICMS' && p.uf === uf)!.aliquota_pct
    expect([icms('PE'), icms('SP'), icms('SC'), icms('ES')]).toEqual(['20.5000', '18.0000', '17.0000', '17.0000'])
    expect(parametroIcmsUf(aliquotaDaUf('RJ', ALIQUOTAS_UF)!).aliquota_pct).toBe('22.0000')
  })
  it('T2 exemplo ao centavo', () => {
    expect(['SIMPLES', 'PRESUMIDO', 'REAL'].map((r) => apurarImportacao({ ...ex, regime: r as never }).custo_total))
      .toEqual(['107412.25', '85392.74', '78349.79'])
  })
  it('T3 rateio 3 NCMs fecha', () => {
    const input = require('../../../docs/import-intelligence/fixtures/casos/04-rateio-valor-aduaneiro-3-itens/input.json')
    const r = calcularLandedCost(input)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const porDesp = new Map<string, number>()
    for (const x of r.value.rateios) porDesp.set(x.origem_id, (porDesp.get(x.origem_id) ?? 0) + Number(x.valor_alocado_brl))
    for (const d of input.despesas.filter((d: { atribuicao: { modo: string } }) => d.atribuicao.modo === 'RATEIO')) {
      expect(porDesp.get(d.id)!.toFixed(2)).toBe(Number(d.valor_brl ?? d.valor).toFixed(2))
    }
    expect(r.value.itens.reduce((a, i) => a + Number(i.custo_total_brl), 0).toFixed(2)).toBe("400.00")
  })
  it('T4 margem → varejo e atacado', () => {
    const unit = '10.741225'
    expect(simularPreco(unit, { canal: 'VAREJO', modo: 'MARGEM', percentual: '40' }).preco_brl).toBe('17.90')
    expect(simularPreco(unit, { canal: 'ATACADO', modo: 'MARKUP', percentual: '30' }).preco_brl).toBe('13.96')
  })
  it('T5 4% interestadual + avisos', () => {
    const c = simularRevendaInterestadual({ uf_origem: 'PE', uf_destino: 'BA', preco_venda_brl: '1000', destinatario_contribuinte: true })
    expect(c).toMatchObject({ aliquota_pct: '4.0000', icms_destacado_brl: '40.00', regra: 'RES_SENADO_13_2012' })
    expect(c.avisos).toContain('POSSIVEL_ST')
    const n = simularRevendaInterestadual({ uf_origem: 'PE', uf_destino: 'BA', preco_venda_brl: '1000', destinatario_contribuinte: false })
    expect(n.avisos).toContain('DIFAL_NAO_CONTRIBUINTE')
    expect(n.difal_estimado_brl).toBe('165.00')
  })
})
