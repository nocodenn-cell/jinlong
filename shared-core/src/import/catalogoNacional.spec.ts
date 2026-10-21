import { describe, expect, it } from 'vitest'
import { CATALOGO_TRIBUTARIO_PESQUISADO_PE, calcularTributosImportacao } from './tributacao'
import { ALIQUOTAS_UF, UFS, aplicaAfrmm, montarCatalogoNacional, simularRevendaInterestadual } from './catalogoNacional'

const itens = [
  { item_id: 'a', ncm: '85161000', valor_aduaneiro_brl: '1000', despesas_aduaneiras_brl: '215.67' },
  { item_id: 'b', ncm: '39249000', valor_aduaneiro_brl: '12345.678901' },
  { item_id: 'c', ncm: '61091000', valor_aduaneiro_brl: '0.01' },
]
const calc = (parametros: Parameters<typeof calcularTributosImportacao>[0]['parametros'], data = '2026-10-21') =>
  calcularTributosImportacao({ data_fato_gerador: data, uf_destino: 'PE', itens, parametros })

describe('catálogo nacional — 27 UFs', () => {
  it('tem as 27 UFs, únicas, todas PESQUISADO, com alíquota e base legal', () => {
    expect(UFS).toHaveLength(27)
    expect(new Set(UFS).size).toBe(27)
    for (const a of ALIQUOTAS_UF) {
      expect(a.status).toBe('PESQUISADO')
      expect(a.icms_modal_pct).toMatch(/^\d+\.\d{4}$/)
      expect(a.base_legal.length).toBeGreaterThan(5)
    }
  })
  it('RJ e SE somam FCP geral; SP não', () => {
    const icms = (uf: string) => montarCatalogoNacional({ uf }).find((p) => p.tributo === 'ICMS')!.aliquota_pct
    expect(icms('RJ')).toBe('22.0000')
    expect(icms('SE')).toBe('20.0000')
    expect(icms('SP')).toBe('18.0000')
    expect(icms('MA')).toBe('23.0000')
  })
})

describe('ZERO REGRESSÃO — PE idêntico ao #601', () => {
  const antigo = calc(CATALOGO_TRIBUTARIO_PESQUISADO_PE)
  const novo = calc(montarCatalogoNacional({ uf: 'PE' }))
  const sem = (r: typeof antigo, t: string[]) => r.sugestoes.filter((s) => !t.includes(s.tributo))
  it('II/IPI/PIS/COFINS/ICMS/IS: sugestões idênticas (base, alíquota, valor, parâmetro, vigência, status)', () => {
    const strip = (s: (typeof antigo.sugestoes)[number]) => ({ ...s, memoria: s.tributo === 'COFINS_IMPORTACAO' ? '' : s.memoria })
    expect(sem(novo, ['CBS', 'IBS']).map(strip)).toEqual(sem(antigo, ['CBS', 'IBS']).map(strip))
    for (const t of ['PIS_IMPORTACAO', 'COFINS_IMPORTACAO', 'ICMS']) expect(novo.totais[t]).toBe(antigo.totais[t])
    expect(novo.sugestoes.find((s) => s.tributo === 'ICMS')!.parametro_id).toBe('pesq-icms-pe-modal')
  })
  it('CBS/IBS 2026: correção verificada (não cobrados) — 0, e nunca entram no custo (antes também não)', () => {
    for (const s of novo.sugestoes.filter((x) => x.tributo === 'CBS' || x.tributo === 'IBS')) {
      expect(s.valor_brl).toBe('0.00')
      expect(s.incorpora_custo_sugerido).toBe(false)
    }
    for (const s of antigo.sugestoes.filter((x) => x.tributo === 'CBS' || x.tributo === 'IBS')) expect(s.incorpora_custo_sugerido).toBe(false)
  })
  it('catálogo PE do #601 (fallback) continua intacto', () => {
    expect(CATALOGO_TRIBUTARIO_PESQUISADO_PE.map((p) => [p.id, p.aliquota_pct])).toEqual([
      ['pesq-pis-imp-geral', '2.1000'], ['pesq-cofins-imp-geral', '9.6500'], ['pesq-icms-pe-modal', '20.5000'],
      ['pesq-cbs-2026', '0.9000'], ['pesq-ibs-2026', '0.1000'],
    ])
  })
  it('tabela vinda do banco vazia ⇒ fallback para a constante', () => {
    expect(montarCatalogoNacional({ uf: 'PE' }, [])).toEqual(montarCatalogoNacional({ uf: 'PE' }))
  })
})

describe('overrides do cliente (opção A)', () => {
  it('II/IPI só existem quando o cliente informa; NCM mais específico vence', () => {
    expect(calc(montarCatalogoNacional({ uf: 'SP' })).sugestoes.find((s) => s.tributo === 'II')!.status).toBe('SEM_PARAMETRO')
    const ps = montarCatalogoNacional({ uf: 'SP', overrides: [
      { id: '1', tributo: 'II', ncm_prefixo: '', aliquota_pct: '14' },
      { id: '2', tributo: 'II', ncm_prefixo: '8516', aliquota_pct: '18' },
      { id: '3', tributo: 'IPI', ncm_prefixo: '85161000', aliquota_pct: '6.5' },
    ] })
    const r = calcularTributosImportacao({ data_fato_gerador: '2026-10-21', uf_destino: 'SP', itens, parametros: ps })
    const a = (t: string, i: string) => r.sugestoes.find((s) => s.tributo === t && s.item_id === i)!
    expect(a('II', 'a')).toMatchObject({ aliquota_pct: '18.0000', fonte: 'CONFIGURADO_CLIENTE', incorpora_custo_sugerido: true })
    expect(a('II', 'b').aliquota_pct).toBe('14.0000')
    expect(a('IPI', 'a').aliquota_pct).toBe('6.5000')
    expect(a('IPI', 'b').status).toBe('SEM_PARAMETRO')
  })
  it('% efetivo de ICMS (incentivo) vence o modal pesquisado', () => {
    const r = calcularTributosImportacao({ data_fato_gerador: '2026-10-21', uf_destino: 'SC', itens, parametros: montarCatalogoNacional({ uf: 'SC', icms_efetivo_pct: '2.6' }) })
    expect(r.sugestoes.find((s) => s.tributo === 'ICMS')).toMatchObject({ aliquota_pct: '2.6000', parametro_id: 'cli-icms-efetivo' })
  })
  it('AL antes de 01/04/2026 não tem parâmetro (vigência respeitada); 2027 CBS fica pendente', () => {
    const r = calcularTributosImportacao({ data_fato_gerador: '2026-03-01', uf_destino: 'AL', itens, parametros: montarCatalogoNacional({ uf: 'AL' }) })
    expect(r.sugestoes.find((s) => s.tributo === 'ICMS')!.status).toBe('SEM_PARAMETRO')
    const r27 = calcularTributosImportacao({ data_fato_gerador: '2027-02-01', uf_destino: 'PE', itens, parametros: montarCatalogoNacional({ uf: 'PE' }) })
    expect(r27.sugestoes.find((s) => s.tributo === 'CBS')!.status).toBe('PENDENTE_ALIQUOTA')
  })
  it('AFRMM só marítimo', () => {
    expect(aplicaAfrmm('MARITIMO')).toBe(true)
    expect(aplicaAfrmm('AEREO')).toBe(false)
    expect(aplicaAfrmm(null)).toBe(false)
  })
})

describe('revenda interestadual (Res. Senado 13/2012)', () => {
  it('importado PE→SP contribuinte: 4% + aviso FCI/ST, sem DIFAL', () => {
    const r = simularRevendaInterestadual({ uf_origem: 'PE', uf_destino: 'SP', preco_venda_brl: '1000', destinatario_contribuinte: true })
    expect(r).toMatchObject({ interestadual: true, aliquota_pct: '4.0000', icms_destacado_brl: '40.00', regra: 'RES_SENADO_13_2012', difal_estimado_brl: null })
    expect(r.avisos).toContain('FCI_OBRIGATORIA')
    expect(r.avisos).toContain('POSSIVEL_ST')
  })
  it('não contribuinte em RJ: DIFAL = 22% − 4%', () => {
    const r = simularRevendaInterestadual({ uf_origem: 'PE', uf_destino: 'RJ', preco_venda_brl: '1000', destinatario_contribuinte: false })
    expect(r.difal_estimado_brl).toBe('180.00')
    expect(r.avisos[0]).toBe('DIFAL_NAO_CONTRIBUINTE')
  })
  it('conteúdo importado ≤ 40% usa 7%/12%; operação interna usa a carga da UF', () => {
    expect(simularRevendaInterestadual({ uf_origem: 'SP', uf_destino: 'PE', preco_venda_brl: '100', conteudo_importacao_pct: '30', destinatario_contribuinte: true }).aliquota_pct).toBe('7.0000')
    expect(simularRevendaInterestadual({ uf_origem: 'PE', uf_destino: 'SP', preco_venda_brl: '100', conteudo_importacao_pct: '40', destinatario_contribuinte: true }).aliquota_pct).toBe('12.0000')
    const i = simularRevendaInterestadual({ uf_origem: 'PE', uf_destino: 'PE', preco_venda_brl: '100', destinatario_contribuinte: true })
    expect(i).toMatchObject({ interestadual: false, aliquota_pct: '20.5000', regra: 'INTERNA' })
  })
})
