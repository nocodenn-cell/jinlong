import { describe, expect, it } from 'vitest'
import {
  WAVE_A_DESCRIPTORS,
  WAVE_B_DESCRIPTORS,
  assertRecommendationInputPurity,
  createInMemoryFactProvider,
  createRecommendationEngineStub,
  envelopeStub,
  runEngineLoop,
  type FactEnvelope,
  type RecommendationEngineInput,
} from '../index'

function saleFact(storeId = 'loja-1'): FactEnvelope {
  return envelopeStub({
    factId: 'SaleFact',
    owner: 'sales',
    readiness: 'READY',
    storeId,
    confidence: 'HIGH',
    operationalConfidence: 1,
    inputFingerprint: 'sale:1',
  })
}

function stockFact(storeId = 'loja-1'): FactEnvelope {
  return envelopeStub({
    factId: 'StockPositionFact',
    owner: 'inventory',
    readiness: 'READY',
    storeId,
    confidence: 'HIGH',
    operationalConfidence: 1,
    inputFingerprint: 'stock:1',
  })
}

describe('Engine Loop v1 (core only)', () => {
  it('executa pipeline completo e retorna Decision Snapshot sem recomendações', async () => {
    const providers = [
      createInMemoryFactProvider(WAVE_A_DESCRIPTORS.SaleFact, [saleFact()]),
      createInMemoryFactProvider(WAVE_A_DESCRIPTORS.StockPositionFact, [stockFact()]),
    ]

    const snapshot = await runEngineLoop({
      storeId: 'loja-1',
      providers,
      now: () => new Date('2026-07-19T18:00:00.000Z'),
    })

    expect(snapshot.timestamp).toBe('2026-07-19T18:00:00.000Z')
    expect(snapshot.storeId).toBe('loja-1')
    expect(snapshot.factsUsed).toHaveLength(2)
    expect(snapshot.kpiValues).toEqual([])
    expect(snapshot.analysis.findings).toEqual([])
    expect(snapshot.recommendations).toEqual([])
    expect(snapshot.alerts).toEqual([])
    expect(snapshot.actionPlans).toEqual([])
    expect(snapshot.memory.entries.length).toBeGreaterThanOrEqual(1)
    expect(snapshot.executive.ruleId).toBe('EXECUTIVE_COMPOSE')
    expect(snapshot.executive.kpiSummary.supported).toBeGreaterThanOrEqual(0)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(snapshot.metrics.providersLoaded).toBe(2)
    expect(snapshot.metrics.actionPlans).toBe(0)
    expect(snapshot.metrics.factsUsed).toBe(2)
    expect(snapshot.metrics.averageOperationalConfidencePercent).toBe(100)
    expect(snapshot.metrics.analysisFindings).toBe(0)
    expect(snapshot.metrics.executionTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('nenhum UNSUPPORTED entra em factsUsed', async () => {
    const providers = [
      createInMemoryFactProvider(WAVE_A_DESCRIPTORS.SaleFact, [saleFact()]),
      createInMemoryFactProvider(WAVE_B_DESCRIPTORS.CustomerPurchaseFact, [
        envelopeStub({
          factId: 'CustomerPurchaseFact',
          owner: 'composite',
          readiness: 'BLOCKED',
          confidence: 'UNSUPPORTED',
          operationalConfidence: 0,
        }),
      ]),
    ]

    const snapshot = await runEngineLoop({ storeId: 'loja-1', providers })

    expect(snapshot.factsUsed.every((f) => f.factId !== 'CustomerPurchaseFact')).toBe(
      true,
    )
    expect(snapshot.factsBlocked.some((b) => b.factId === 'CustomerPurchaseFact')).toBe(
      true,
    )
    expect(snapshot.factsBlocked[0]?.reason).toBe('UNSUPPORTED')
    expect(snapshot.gatesEncountered).toContain('GATE_CUSTOMER_SALE_LINK')
  })

  it('PARTIAL permanece identificado e fora do Recommendation Engine', async () => {
    const marginEnvelope = envelopeStub({
      factId: 'MarginFact',
      owner: 'sales',
      readiness: 'PARTIAL',
      confidence: 'MEDIUM',
      operationalConfidence: 0.72,
      inputFingerprint: 'margin:1',
    })

    const providers = [
      createInMemoryFactProvider(WAVE_A_DESCRIPTORS.SaleFact, [saleFact()]),
      createInMemoryFactProvider(WAVE_B_DESCRIPTORS.MarginFact, [marginEnvelope]),
    ]

    let recFacts: readonly FactEnvelope[] = []
    const spyEngine = {
      async evaluate(input: RecommendationEngineInput) {
        recFacts = input.facts
        return []
      },
    }

    const snapshot = await runEngineLoop({
      storeId: 'loja-1',
      providers,
      recommendationEngine: spyEngine,
    })

    expect(snapshot.factsPartialIdentified).toHaveLength(1)
    expect(snapshot.factsPartialIdentified[0]?.factId).toBe('MarginFact')
    expect(snapshot.factsUsed.every((f) => f.factId !== 'MarginFact')).toBe(true)
    expect(recFacts.every((f) => f.factId !== 'MarginFact')).toBe(true)
    expect(recFacts.every((f) => f.operationalConfidence > 0)).toBe(true)
  })

  it('confiança agregada usa apenas Facts SUPPORTED do snapshot', async () => {
    const providers = [
      createInMemoryFactProvider(WAVE_A_DESCRIPTORS.SaleFact, [saleFact()]),
      createInMemoryFactProvider(WAVE_A_DESCRIPTORS.StockPositionFact, [
        envelopeStub({
          factId: 'StockPositionFact',
          owner: 'inventory',
          readiness: 'READY',
          confidence: 'HIGH',
          operationalConfidence: 0.9,
          inputFingerprint: 'stock:2',
        }),
      ]),
      createInMemoryFactProvider(WAVE_B_DESCRIPTORS.MarginFact, [
        envelopeStub({
          factId: 'MarginFact',
          owner: 'sales',
          readiness: 'PARTIAL',
          confidence: 'MEDIUM',
          operationalConfidence: 0.72,
        }),
      ]),
    ]

    const snapshot = await runEngineLoop({ storeId: 'loja-1', providers })
    // (1.0 + 0.9) / 2 = 0.95 → 95%
    expect(snapshot.confidenceSummary.averageOperationalConfidence).toBe(0.95)
    expect(snapshot.confidenceSummary.averageOperationalConfidencePercent).toBe(95)
    expect(snapshot.confidenceSummary.supportedCount).toBe(2)
  })

  it('Recommendation Engine nunca recebe Facts bloqueados', async () => {
    const impure: RecommendationEngineInput = {
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      facts: [
        envelopeStub({
          factId: 'CustomerPurchaseFact',
          owner: 'composite',
          readiness: 'BLOCKED',
          confidence: 'UNSUPPORTED',
          operationalConfidence: 0,
        }),
      ],
      findings: [],
    }
    expect(() => assertRecommendationInputPurity(impure)).toThrow(
      /INTEL_REC_IMPURE_FACT/,
    )

    const stub = createRecommendationEngineStub()
    await expect(
      stub.evaluate({ ...impure, facts: [saleFact()], findings: [] }),
    ).resolves.toEqual([])
  })

  it('elimina Facts duplicados no agregador', async () => {
    const dup = saleFact()
    const providers = [
      createInMemoryFactProvider(WAVE_A_DESCRIPTORS.SaleFact, [dup, dup]),
    ]
    const snapshot = await runEngineLoop({ storeId: 'loja-1', providers })
    expect(snapshot.factsUsed).toHaveLength(1)
    expect(snapshot.factsBlocked.some((b) => b.reason === 'DUPLICATE')).toBe(true)
  })

  it('ignora providers CONTEXT nas métricas de ignore', async () => {
    const cashDescriptor = {
      ...WAVE_A_DESCRIPTORS.SaleFact,
      factId: 'CashMovementFact' as const,
      wave: 'CONTEXT' as const,
      statusExplanationCode: 'intel.provider.cash_movement.context',
    }
    const providers = [
      createInMemoryFactProvider(WAVE_A_DESCRIPTORS.SaleFact, [saleFact()]),
      createInMemoryFactProvider(cashDescriptor, [
        envelopeStub({
          factId: 'CashMovementFact',
          owner: 'cash',
          readiness: 'CONTEXT',
          confidence: 'MEDIUM',
          operationalConfidence: 1,
        }),
      ]),
    ]
    const snapshot = await runEngineLoop({ storeId: 'loja-1', providers })
    expect(snapshot.metrics.providersIgnored).toBe(1)
    expect(snapshot.metrics.providersLoaded).toBe(1)
    expect(snapshot.factsUsed).toHaveLength(1)
  })
})
