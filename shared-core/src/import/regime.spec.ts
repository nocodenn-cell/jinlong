import { describe, expect, it } from 'vitest'
import { apurarImportacao, calcularAfrmm, incorporaPorRegime, regimeOuPadrao } from './regime'

// FOB USD 10.000, frete 1.000, seguro 100, câmbio 5,40; II 18, IPI 10, PIS 2,10, COFINS 9,65, ICMS PE 20,5; Siscomex 115,67
const ex = { fob_brl: '54000', frete_brl: '5400', seguro_brl: '540', maritimo: true, siscomex_brl: '115.67',
  ii_pct: '18', ipi_pct: '10', pis_pct: '2.10', cofins_pct: '9.65', icms_pct: '20.5' }

describe('apuração por regime (exemplo da análise de valor)', () => {
  it('Simples: tudo vira custo = 107.412,25', () => {
    const r = apurarImportacao({ ...ex, regime: 'SIMPLES' })
    expect(r).toMatchObject({ valor_aduaneiro: '59940.00', ii: '10789.20', ipi: '7072.92', pis: '1258.74', cofins: '5784.21',
      afrmm: '432.00', icms: '22019.51', custo_total: '107412.25', creditos: '0.00' })
  })
  it('Presumido: ICMS vira crédito', () => {
    expect(apurarImportacao({ ...ex, regime: 'PRESUMIDO' }).custo_total).toBe('85392.74')
  })
  it('Real: PIS, COFINS e ICMS viram crédito', () => {
    expect(apurarImportacao({ ...ex, regime: 'REAL' })).toMatchObject({ custo_total: '78349.79', creditos: '29062.46' })
  })
  it('AFRMM só marítimo; regime padrão Simples', () => {
    expect(calcularAfrmm('5400', false)).toBe('0.00')
    expect(regimeOuPadrao(null)).toBe('SIMPLES')
    expect(incorporaPorRegime('ICMS', 'PRESUMIDO')).toBe(false)
    expect(incorporaPorRegime('II', 'REAL')).toBeNull()
  })
})
