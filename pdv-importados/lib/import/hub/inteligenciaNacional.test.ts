import { describe, expect, it } from 'vitest'
import { montarCatalogoNacional } from '@shared-core/src/import'
import { basesNacionais, sugerirTributos } from './inteligencia'

const item = { id: 'i1', descricao: 'x', codigo_fornecedor: null, ncm: '85161000', produto_id: null, moeda: 'USD', valor_mercadoria_moeda: '10000',
  valor_aduaneiro_brl: null, quantidade_comercial: '1', unidade_comercial: 'UN', fator_para_estoque: '1', quantidade_estoque: '1',
  peso_liquido_kg: null, peso_bruto_kg: null, volume_m3: null }
const cambios = [{ id: 'c', moeda: 'USD', taxa: '5.40', fonte: 'PTAX', data: '2026-10-21' }]
const d = (tipo: string, valor: string) => ({ id: tipo, tipo, moeda: 'USD', valor, incorporavel: 'SIM' as const, atribuicao_modo: 'RATEIO' as const,
  item_id: null, criterio: null, justificativa: '', status_conferencia: 'PENDENTE' as const, documento_id: null })
const despesas = [d('Frete internacional', '1000'), d('Seguro', '100')]

describe('modo nacional', () => {
  it('VA = (FOB+frete+seguro)×câmbio; Siscomex+AFRMM na base do ICMS', () => {
    const b = basesNacionais([item], cambios, { despesas, maritimo: true, regime: 'SIMPLES' })
    expect(b.ok[0]).toMatchObject({ valor_aduaneiro_brl: '59940.000000', despesas_aduaneiras_brl: '547.670000' })
    expect(b.resumo).toMatchObject({ afrmm_brl: '432.00', siscomex_brl: '115.67', afrmm_calculado: true })
  })
  it('ICMS PE inclui despesas; regime decide o custo', () => {
    const p = montarCatalogoNacional({ uf: 'PE', overrides: [
      { id: 'o1', tributo: 'II', ncm_prefixo: '', aliquota_pct: '18.0000' }, { id: 'o2', tributo: 'IPI', ncm_prefixo: '', aliquota_pct: '10.0000' }] })
    const r = sugerirTributos([item], cambios, 'PE', '2026-10-21', p, 'v', { despesas, maritimo: true, regime: 'PRESUMIDO' })
    const icms = r.sugestoes.find((s) => s.tributo === 'ICMS')!
    expect(icms.valor_brl).toBe('22019.51')
    expect(icms.incorpora_custo_sugerido).toBe(false)
    expect(r.sugestoes.find((s) => s.tributo === 'PIS_IMPORTACAO')!.incorpora_custo_sugerido).toBe(true)
  })
  it('sem configuração: comportamento demo inalterado', () => {
    const r = sugerirTributos([item], cambios, 'PE', '2026-10-21')
    expect(r.resumoNacional).toBeUndefined()
    expect(r.sugestoes.find((s) => s.tributo === 'II')!.base_brl).toBe('54000.00')
  })
})
