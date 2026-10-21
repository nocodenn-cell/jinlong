import { describe, expect, it } from 'vitest'
import { basesTributaveis, sugerirTributos, sugestaoParaLancamento } from './inteligencia'
import { pendenciasDossie } from '@/app/admin/importacoes/_components/DossieSecao'
import type { Item } from './dadosImportacoes'

const item = (p: Partial<Item>): Item => ({
  id: 'i1', descricao: 'Chaleira', codigo_fornecedor: null, ncm: '85161000', produto_id: null, moeda: 'USD',
  valor_mercadoria_moeda: '200', valor_aduaneiro_brl: null, quantidade_comercial: '100', unidade_comercial: 'UN',
  fator_para_estoque: '1', quantidade_estoque: '100', peso_liquido_kg: null, peso_bruto_kg: null, volume_m3: null, ...p,
})

describe('ponte hub ↔ tributação', () => {
  it('valor aduaneiro: informado > BRL > moeda × câmbio (10 casas) ; sem câmbio sinaliza', () => {
    const r = basesTributaveis(
      [item({}), item({ id: 'i2', moeda: 'BRL', valor_mercadoria_moeda: '50' }), item({ id: 'i3', valor_aduaneiro_brl: '7' }), item({ id: 'i4', moeda: 'CNY' })],
      [{ id: 'c', moeda: 'USD', taxa: '5.4321098765', fonte: 'MANUAL', data: '2026-10-01' }],
    )
    expect(r.ok.map((x) => x.valor_aduaneiro_brl)).toEqual(['1086.421975', '50', '7'])
    expect(r.semBase).toEqual([{ item_id: 'i4', motivo: 'SEM_CAMBIO' }])
  })
  it('100 unidades: II 18% fictício sobre VA; lançamento pendente com regra e vigência', () => {
    const r = sugerirTributos([item({ moeda: 'BRL', valor_mercadoria_moeda: '5000' })], [], 'SP', '2026-10-21')
    const ii = r.sugestoes.find((s) => s.tributo === 'II')!
    expect(ii.valor_brl).toBe('900.00')
    expect(sugestaoParaLancamento(ii, '2026-10-21')).toMatchObject({
      tributo_codigo: 'II', status_recuperabilidade: 'NAO_RECUPERAVEL', regra_id: 'demo-ii-8516', regra_incorpora_custo: true,
      regra_vigencia_inicio: '2020-01-01', data_fato_gerador: '2026-10-21', validado_por: null,
    })
    const pis = r.sugestoes.find((s) => s.tributo === 'PIS_IMPORTACAO')!
    expect(sugestaoParaLancamento(pis, '2026-10-21').status_recuperabilidade).toBe('RECUPERAVEL_POTENCIAL')
  })
})

describe('dossiê', () => {
  it('checklist e pendências de conferência', () => {
    const d = pendenciasDossie({
      documentos: [{ id: 'd', tipo: 'DI' } as never, { id: 'e', tipo: 'INVOICE' } as never],
      itens: [item({ ncm: null })], descontos: [],
      despesas: [{ id: 'x', tipo: 'Frete', status_conferencia: 'PENDENTE', documento_id: null } as never],
      tributos: [{ id: 'y', tributo_codigo: 'II', status_conferencia: 'CONFERIDO', status_recuperabilidade: 'PENDENTE_VALIDACAO', documento_id: 'd' } as never],
    })
    expect(d.checklist.filter((c) => c.presente).map((c) => c.tipo)).toEqual(['INVOICE', 'DI_DUIMP'])
    expect(d.pendencias.map((p) => p.chave)).toEqual(['pend_item_sem_ncm', 'pend_despesa_nao_conferida', 'pend_sem_documento', 'pend_tributo_recuperabilidade'])
  })
})
