import { describe, expect, it } from 'vitest'
import {
  WAVE_A_DESCRIPTORS,
  WAVE_A_SUPPORTED_FACT_IDS,
  createInMemoryFactProvider,
  runEngineLoop,
} from '@shared-core/src/intelligence'
import { createWaveAProviders } from './create-wave-a-providers'
import { mapApTitleRow } from './financial/ap-title-fact-provider'
import { mapArTitleRow } from './financial/ar-title-fact-provider'
import { mapSaleRow } from './sales/sale-fact-provider'
import { mapStockPositionRow } from './inventory/stock-position-fact-provider'
import { mapProductRow } from './products/product-fact-provider'

describe('Wave A FactProviders (Onda 1)', () => {
  it('createWaveAProviders cobre os 12 FactIds Wave A', () => {
    const fake = {} as never
    const providers = createWaveAProviders(fake)
    expect(providers).toHaveLength(WAVE_A_SUPPORTED_FACT_IDS.length)
    const ids = new Set(providers.map((p) => p.descriptor.factId))
    for (const id of WAVE_A_SUPPORTED_FACT_IDS) {
      expect(ids.has(id)).toBe(true)
    }
  })

  it('mapSaleRow emite payload legível pelos KPIs de receita', () => {
    const env = mapSaleRow('loja-1', {
      id: 'v1',
      caixa_id: 'c1',
      operador_id: 'op1',
      data: '2026-07-19T12:00:00.000Z',
      status: 'CONCLUIDA',
      tipo_venda: 'VAREJO',
      total_bruto: 100,
      total_desconto: 10,
      total_liquido: 90,
    })
    expect(env.factId).toBe('SaleFact')
    expect(env.readiness).toBe('READY')
    expect(env.payload).toMatchObject({
      grossAmount: 100,
      netAmount: 90,
      discountAmount: 10,
    })
  })

  it('Engine Loop com Sale+AR+AP → KPIs Wave A SUPPORTADOS (não BLOCKED)', async () => {
    const sale = mapSaleRow('loja-kpi', {
      id: 'v-kpi',
      caixa_id: 'c1',
      operador_id: null,
      data: '2026-07-19T12:00:00.000Z',
      status: 'CONCLUIDA',
      tipo_venda: 'VAREJO',
      total_bruto: 200,
      total_desconto: 0,
      total_liquido: 200,
    })
    const ar = mapArTitleRow({
      id: 'ar1',
      loja_id: 'loja-kpi',
      cliente_id: 'cli1',
      venda_id: null,
      valor_total: 50,
      valor_aberto: 50,
      vencimento: '2026-08-01',
      status: 'ABERTO',
      created_at: '2026-07-19T12:00:00.000Z',
    })
    const ap = mapApTitleRow({
      id: 'ap1',
      loja_id: 'loja-kpi',
      fornecedor_id: 'f1',
      valor_total: 30,
      valor_pago: 0,
      vencimento: '2026-08-01',
      status: 'ABERTO',
      nfe_numero: null,
      criado_em: '2026-07-19T12:00:00.000Z',
    })

    const providers = [
      createInMemoryFactProvider(WAVE_A_DESCRIPTORS.SaleFact, [sale]),
      createInMemoryFactProvider(WAVE_A_DESCRIPTORS.ArTitleFact, [ar]),
      createInMemoryFactProvider(WAVE_A_DESCRIPTORS.ApTitleFact, [ap]),
      ...Object.values(WAVE_A_DESCRIPTORS)
        .filter(
          (d) =>
            d.factId !== 'SaleFact' &&
            d.factId !== 'ArTitleFact' &&
            d.factId !== 'ApTitleFact',
        )
        .map((d) => createInMemoryFactProvider(d, [])),
    ]

    const snapshot = await runEngineLoop({
      storeId: 'loja-kpi',
      providers,
      now: () => new Date('2026-07-19T22:00:00.000Z'),
    })

    const supported = new Set(snapshot.supportedKpis.map((k) => k.id))
    expect(supported.has('GrossRevenue')).toBe(true)
    expect(supported.has('NetRevenue')).toBe(true)
    expect(supported.has('AverageTicket')).toBe(true)
    expect(supported.has('ArAging')).toBe(true)
    expect(supported.has('ApAging')).toBe(true)

    const blockedSaleKpis = snapshot.blockedKpis.filter((k) =>
      ['GrossRevenue', 'NetRevenue', 'AverageTicket', 'ArAging', 'ApAging'].includes(
        k.id,
      ),
    )
    expect(blockedSaleKpis).toHaveLength(0)

    expect(snapshot.factsUsed.some((f) => f.factId === 'SaleFact')).toBe(true)
  })

  it('mappers de estoque/produto não inventam regras de KPI', () => {
    const stock = mapStockPositionRow({
      id: 'e1',
      loja_id: 'loja-1',
      produto_id: 'p1',
      quantidade_atual: 5,
      estoque_minimo: 2,
      updated_at: '2026-07-19T12:00:00.000Z',
      version: 1,
    })
    const product = mapProductRow({
      id: 'p1',
      loja_id: 'loja-1',
      nome: 'Item',
      codigo_barras: '789',
      categoria_id: null,
      marca_id: null,
      fornecedor_id: null,
      ativo: true,
      status_publicacao: 'PUBLICADO',
      updated_at: '2026-07-19T12:00:00.000Z',
    })
    expect(stock.factId).toBe('StockPositionFact')
    expect(product.factId).toBe('ProductFact')
    expect(JSON.stringify(stock)).not.toMatch(/GrossRevenue|ruleId/)
  })
})
