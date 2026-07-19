/**
 * Onda 2 — Homologação do pipeline ponta a ponta.
 * Dados com shape real (mappers Wave A) → Engine Loop → Persist → Read Model.
 */
import { describe, expect, it } from 'vitest'
import {
  WAVE_A_DESCRIPTORS,
  createInMemoryFactProvider,
  runEngineLoop,
} from '@shared-core/src/intelligence'
import { createInMemoryDecisionRecordRepository } from '../adapters/in-memory-decision-record-repository'
import { createInMemoryDecisionSnapshotRepository } from '../adapters/in-memory-decision-snapshot-repository'
import { runDecisionIntelligenceOrchestrator } from '../orchestrator/run-orchestrator'
import { mapApTitleRow } from '../providers/financial/ap-title-fact-provider'
import { mapArTitleRow } from '../providers/financial/ar-title-fact-provider'
import { mapSaleLineRow } from '../providers/sales/sale-line-fact-provider'
import { mapSaleRow } from '../providers/sales/sale-fact-provider'
import { mapStockPositionRow } from '../providers/inventory/stock-position-fact-provider'
import { mapProductRow } from '../providers/products/product-fact-provider'
import { mapCustomerRow } from '../providers/customers/customer-fact-provider'

function buildHomologProviders(storeId: string) {
  const sale = mapSaleRow(storeId, {
    id: 'hom-venda-1',
    caixa_id: 'hom-caixa',
    operador_id: 'op-1',
    data: '2026-07-18T15:00:00.000Z',
    status: 'CONCLUIDA',
    tipo_venda: 'VAREJO',
    total_bruto: 500,
    total_desconto: 50,
    total_liquido: 450,
  })
  const line = mapSaleLineRow(storeId, {
    id: 'hom-item-1',
    venda_id: 'hom-venda-1',
    produto_id: 'hom-prod-1',
    quantidade: 2,
    preco_unitario: 250,
    desconto_unitario: 25,
    custo_unitario_snap: 100,
    tipo_preco: 'VAREJO',
  })
  const ar = mapArTitleRow({
    id: 'hom-ar-1',
    loja_id: storeId,
    cliente_id: 'hom-cli-1',
    venda_id: 'hom-venda-1',
    valor_total: 100,
    valor_aberto: 100,
    vencimento: '2026-08-18',
    status: 'ABERTO',
    created_at: '2026-07-18T15:00:00.000Z',
  })
  const ap = mapApTitleRow({
    id: 'hom-ap-1',
    loja_id: storeId,
    fornecedor_id: 'hom-forn-1',
    valor_total: 80,
    valor_pago: 20,
    vencimento: '2026-08-10',
    status: 'PARCIAL',
    nfe_numero: '123',
    criado_em: '2026-07-10T10:00:00.000Z',
  })
  const stock = mapStockPositionRow({
    id: 'hom-est-1',
    loja_id: storeId,
    produto_id: 'hom-prod-1',
    quantidade_atual: 12,
    estoque_minimo: 3,
    updated_at: '2026-07-18T15:00:00.000Z',
    version: 2,
  })
  const product = mapProductRow({
    id: 'hom-prod-1',
    loja_id: storeId,
    nome: 'Produto Homolog',
    codigo_barras: '7891000100015',
    categoria_id: null,
    marca_id: null,
    fornecedor_id: 'hom-forn-1',
    ativo: true,
    status_publicacao: 'PUBLICADO',
    updated_at: '2026-07-18T15:00:00.000Z',
  })
  const customer = mapCustomerRow({
    id: 'hom-cli-1',
    loja_id: storeId,
    nome: 'Cliente Homolog',
    documento: '12345678901',
    ativo: true,
    limite_credito: 1000,
    created_at: '2026-01-01T00:00:00.000Z',
  })

  const byId: Partial<Record<string, typeof sale[]>> = {
    SaleFact: [sale],
    SaleLineFact: [line],
    ArTitleFact: [ar],
    ApTitleFact: [ap],
    StockPositionFact: [stock],
    ProductFact: [product],
    CustomerFact: [customer],
  }

  return Object.values(WAVE_A_DESCRIPTORS).map((d) =>
    createInMemoryFactProvider(d, byId[d.factId] ?? []),
  )
}

describe('Pipeline Homologation (Onda 2)', () => {
  it('valida Facts → KPIs → Analysis → Rec → Alert → Plan → Memory → Executive', async () => {
    const storeId = 'loja-homolog-1'
    const snapshot = await runEngineLoop({
      storeId,
      providers: buildHomologProviders(storeId),
      now: () => new Date('2026-07-19T20:00:00.000Z'),
    })

    // Facts
    expect(snapshot.factsUsed.length).toBeGreaterThan(0)
    expect(snapshot.factsUsed.some((f) => f.factId === 'SaleFact')).toBe(true)
    expect(snapshot.factsUsed.some((f) => f.factId === 'ArTitleFact')).toBe(true)

    // KPIs
    const supportedIds = snapshot.supportedKpis.map((k) => k.id)
    expect(supportedIds).toEqual(
      expect.arrayContaining([
        'GrossRevenue',
        'NetRevenue',
        'AverageTicket',
        'ArAging',
        'ApAging',
      ]),
    )
    expect(snapshot.supportedKpis.every((k) => k.value !== null)).toBe(true)

    // Analysis
    expect(snapshot.analysis).toBeTruthy()
    expect(Array.isArray(snapshot.analysis.findings)).toBe(true)

    // Recommendations / Alerts / Action Plans
    expect(Array.isArray(snapshot.recommendations)).toBe(true)
    expect(Array.isArray(snapshot.alerts)).toBe(true)
    expect(Array.isArray(snapshot.actionPlans)).toBe(true)

    // Memory
    expect(snapshot.memory.storeId).toBe(storeId)
    expect(snapshot.memory.ruleVersion).toBeTruthy()
    expect(snapshot.memory.pipelineFingerprint).toBeTruthy()
    expect(snapshot.memory.entries.length).toBeGreaterThan(0)

    // Executive
    expect(snapshot.executive.storeId).toBe(storeId)
    expect(snapshot.executive.operationalConfidence).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(snapshot.executive.headlineCodes)).toBe(true)

    // Metrics
    expect(snapshot.metrics.factsUsed).toBeGreaterThan(0)
    expect(snapshot.metrics.kpisSupported).toBeGreaterThanOrEqual(5)
    expect(snapshot.metrics.executionTimeMs).toBeGreaterThanOrEqual(0)

    // Traceability: recommendations link findings
    for (const rec of snapshot.recommendations) {
      expect(rec.sourceFindingIds.length).toBeGreaterThan(0)
      expect(rec.ruleVersion).toBeTruthy()
    }
  })

  it('orchestrator → persist → read model mantém rastreabilidade', async () => {
    const storeId = 'loja-homolog-2'
    const snapshots = createInMemoryDecisionSnapshotRepository()
    const decisions = createInMemoryDecisionRecordRepository()

    const result = await runDecisionIntelligenceOrchestrator({
      trigger: 'manual',
      storeIds: [storeId],
      snapshots,
      decisions,
      providersFactory: () => buildHomologProviders(storeId),
      logMetrics: false,
      now: () => new Date('2026-07-19T20:00:00.000Z'),
    })

    expect(result.ok).toBe(true)
    expect(result.metrics.snapshotsCreated).toBe(1)
    const rm = result.metrics.storeResults[0]?.readModel
    expect(rm).toBeTruthy()
    expect(rm!.executiveDashboard.kpiSummary.supported).toBeGreaterThanOrEqual(5)
    expect(rm!.recommendationQueue.storeId).toBe(storeId)
    expect(rm!.dailyActionPlan.storeId).toBe(storeId)
    expect(rm!.criticalAlerts.storeId).toBe(storeId)

    const latest = await snapshots.findLatestByLoja(storeId)
    expect(latest?.payload.memory.entries.length).toBeGreaterThan(0)
    expect(latest?.snapshotVersion).toBe('di-core-v1.0')
  })
})
