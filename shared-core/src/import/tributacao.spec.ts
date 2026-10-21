import { describe, expect, it } from 'vitest'
import { CATALOGO_TRIBUTARIO_DEMO, calcularTributosImportacao, resolverParametro, type ParametroTributario } from './tributacao'

const base = { data_fato_gerador: '2026-10-21', uf_destino: 'SP', parametros: CATALOGO_TRIBUTARIO_DEMO }
const por = (r: ReturnType<typeof calcularTributosImportacao>, t: string) => r.sugestoes.find((s) => s.tributo === t)!

describe('tributação de importação (determinística, parâmetros versionados)', () => {
  it('cascata II → IPI → PIS/COFINS → ICMS por dentro, em centavos HALF_UP', () => {
    const r = calcularTributosImportacao({ ...base, itens: [{ item_id: 'a', ncm: '85161000', valor_aduaneiro_brl: '1000' }] })
    expect(por(r, 'II')).toMatchObject({ status: 'CALCULADO', base_brl: '1000.00', aliquota_pct: '18.0000', valor_brl: '180.00', parametro_id: 'demo-ii-8516' })
    expect(por(r, 'IPI')).toMatchObject({ base_brl: '1180.00', valor_brl: '59.00' })
    expect(por(r, 'PIS_IMPORTACAO').valor_brl).toBe('21.00')
    expect(por(r, 'COFINS_IMPORTACAO').valor_brl).toBe('96.50')
    expect(por(r, 'ICMS')).toMatchObject({ base_brl: '1654.27', valor_brl: '297.77', parametro_id: 'demo-icms-sp' })
    expect(r.usa_parametro_ficticio).toBe(true)
    expect(r.totais.II).toBe('180.00')
  })
  it('CBS/IBS da Reforma: sem alíquota informada ⇒ PENDENTE_ALIQUOTA (nada inventado); IS sem parâmetro', () => {
    const r = calcularTributosImportacao({ ...base, itens: [{ item_id: 'a', ncm: '85161000', valor_aduaneiro_brl: '1000' }] })
    expect(por(r, 'CBS')).toMatchObject({ status: 'PENDENTE_ALIQUOTA', valor_brl: null, vigencia_inicio: '2026-01-01' })
    expect(por(r, 'IBS').status).toBe('PENDENTE_ALIQUOTA')
    expect(por(r, 'IS').status).toBe('SEM_PARAMETRO')
  })
  it('antes da vigência da CBS/IBS (2025) não há sugestão para elas', () => {
    const r = calcularTributosImportacao({ ...base, data_fato_gerador: '2025-06-01', itens: [{ item_id: 'a', ncm: '85161000', valor_aduaneiro_brl: '1000' }] })
    expect(por(r, 'CBS').status).toBe('SEM_PARAMETRO')
  })
  it('parâmetro do cliente/contador vence o fictício; o NCM mais específico vence; vigência respeitada', () => {
    const extra: ParametroTributario[] = [
      { id: 'cli-ii', tributo: 'II', ncm_prefixo: '8516', uf: null, aliquota_pct: '20.0000', vigencia_inicio: '2026-01-01', vigencia_fim: '2026-12-31', fonte: 'VALIDADO_CONTADOR', incorpora_custo_sugerido: true, nota: '' },
      { id: 'cli-cbs', tributo: 'CBS', ncm_prefixo: '', uf: null, aliquota_pct: '0.9000', vigencia_inicio: '2026-01-01', vigencia_fim: null, fonte: 'CONFIGURADO_CLIENTE', incorpora_custo_sugerido: false, nota: '' },
    ]
    const ps = [...CATALOGO_TRIBUTARIO_DEMO, ...extra]
    expect(resolverParametro(ps, 'II', '85161000', 'SP', '2026-10-21')?.id).toBe('cli-ii')
    expect(resolverParametro(ps, 'II', '85161000', 'SP', '2027-01-01')?.id).toBe('demo-ii-8516')
    expect(resolverParametro(ps, 'II', '39249000', 'SP', '2026-10-21')?.id).toBe('demo-ii-geral')
    const r = calcularTributosImportacao({ ...base, parametros: ps, itens: [{ item_id: 'a', ncm: '85161000', valor_aduaneiro_brl: '1000' }] })
    expect(por(r, 'CBS')).toMatchObject({ status: 'CALCULADO', valor_brl: '9.00', fonte: 'CONFIGURADO_CLIENTE' })
  })
  it('ICMS de UF sem parâmetro específico usa o geral; NCM inválido é sinalizado', () => {
    const r = calcularTributosImportacao({ ...base, uf_destino: 'RJ', itens: [{ item_id: 'a', ncm: '8516', valor_aduaneiro_brl: '10' }, { item_id: 'b', ncm: '39249000', valor_aduaneiro_brl: '0.33' }] })
    expect(r.sugestoes.filter((s) => s.item_id === 'a').every((s) => s.status === 'NCM_INVALIDO')).toBe(true)
    const icmsB = r.sugestoes.find((s) => s.item_id === 'b' && s.tributo === 'ICMS')!
    expect(icmsB.parametro_id).toBe('demo-icms-geral')
    expect(r.sugestoes.find((s) => s.item_id === 'b' && s.tributo === 'II')!.valor_brl).toBe('0.03') // 0.033 → 0.03
  })
  it('despesas aduaneiras entram só na base do ICMS', () => {
    const r = calcularTributosImportacao({ ...base, tributos: ['II', 'ICMS'], itens: [{ item_id: 'a', ncm: '39249000', valor_aduaneiro_brl: '100', despesas_aduaneiras_brl: '18' }] })
    expect(r.sugestoes).toHaveLength(2)
    // (100 + 10 + 18) / 0.82 = 156.097… → 156.10; × 18% = 28.098 → 28.10
    expect(por(r, 'ICMS')).toMatchObject({ base_brl: '156.10', valor_brl: '28.10' })
  })
  it('data inválida é recusada', () => {
    expect(() => calcularTributosImportacao({ ...base, data_fato_gerador: '21/10/2026', itens: [] })).toThrow('DATA_FATO_GERADOR_INVALIDA')
  })
})
