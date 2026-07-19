import { describe, expect, it } from 'vitest'
import {
  DI_DATA_GATES,
  DI_GATE_IDS,
  FACT_IDS,
  FACT_REGISTRY,
  WAVE_A_DESCRIPTORS,
  WAVE_A_SUPPORTED_FACT_IDS,
  WAVE_B_DESCRIPTORS,
  WAVE_CONTEXT_FACT_IDS,
  assertWaveAOnly,
  evaluateFactConsumption,
  evaluateProviderForRecommendation,
  getFactEntry,
  isFactProviderIoAllowed,
  isWaveASupportedFactId,
  listOpenGates,
  summarizeFactConfidence,
  type FactEnvelope,
  type FactProviderDescriptor,
} from './index'

describe('Decision Intelligence Cycle 0 foundation', () => {
  it('registry cobre todos os FactIds do catálogo', () => {
    for (const id of FACT_IDS) {
      expect(FACT_REGISTRY[id].factId).toBe(id)
      expect(getFactEntry(id).owner).toBeTruthy()
    }
  })

  it('mantém gates de qualidade OPEN; types stale SATISFIED', () => {
    expect(DI_GATE_IDS).toHaveLength(4)
    expect(listOpenGates()).toHaveLength(3)
    expect(DI_DATA_GATES.GATE_DATABASE_TYPES_STALE.status).toBe('SATISFIED')
    expect(isFactProviderIoAllowed()).toBe(true)
  })

  it('bloqueia consumo analítico de Facts gated (data_quality)', () => {
    expect(evaluateFactConsumption('MarginFact', 'PARTIAL').ok).toBe(false)
    expect(evaluateFactConsumption('CustomerPurchaseFact', 'BLOCKED').ok).toBe(false)
    expect(evaluateFactConsumption('CashMovementFact', 'CONTEXT').ok).toBe(false)
    expect(evaluateFactConsumption('SaleFact', 'READY')).toEqual({
      ok: true,
      maxConfidence: 'HIGH',
    })
  })
})

describe('Cycle 1 — waves + confidence + purity', () => {
  it('Onda A só contém Facts SUPPORTED do catálogo (sem PaymentFact genérico)', () => {
    expect(WAVE_A_SUPPORTED_FACT_IDS).toContain('SalePaymentFact')
    expect(WAVE_A_SUPPORTED_FACT_IDS).toContain('StockPositionFact')
    expect(WAVE_A_SUPPORTED_FACT_IDS).toContain('SaleFact')
    expect(WAVE_A_SUPPORTED_FACT_IDS).not.toContain('CashMovementFact' as never)
    expect(WAVE_CONTEXT_FACT_IDS).toContain('CashMovementFact')
    for (const id of WAVE_A_SUPPORTED_FACT_IDS) {
      expect(WAVE_A_DESCRIPTORS[id].supportLevel).toBe('SUPPORTED')
      expect(WAVE_A_DESCRIPTORS[id].operationalConfidence).toBe(1)
      expect(WAVE_A_DESCRIPTORS[id].wave).toBe('A')
    }
  })

  it('Onda B declara PARTIAL/UNSUPPORTED sem completar dados', () => {
    expect(WAVE_B_DESCRIPTORS.MarginFact.supportLevel).toBe('PARTIAL')
    expect(WAVE_B_DESCRIPTORS.MarginFact.operationalConfidence).toBe(0.72)
    expect(WAVE_B_DESCRIPTORS.CustomerPurchaseFact.supportLevel).toBe('UNSUPPORTED')
    expect(WAVE_B_DESCRIPTORS.CustomerPurchaseFact.operationalConfidence).toBe(0)
    expect(WAVE_B_DESCRIPTORS.StockCapitalFact.gateIds).toContain(
      'GATE_STOCK_CAPITAL_KARDEX_COST',
    )
  })

  it('assertWaveAOnly rejeita Facts condicionais', () => {
    expect(() => assertWaveAOnly(['SaleFact', 'StockPositionFact'])).not.toThrow()
    expect(() => assertWaveAOnly(['MarginFact'])).toThrow(/INTEL_WAVE_A_VIOLATION/)
    expect(isWaveASupportedFactId('SaleFact')).toBe(true)
    expect(isWaveASupportedFactId('CustomerPurchaseFact')).toBe(false)
  })

  it('UNSUPPORTED bloqueia recommendation; PARTIAL limita confidence', () => {
    const unsupported = evaluateProviderForRecommendation(
      WAVE_B_DESCRIPTORS.CustomerPurchaseFact,
    )
    expect(unsupported.ok).toBe(false)
    if (!unsupported.ok) {
      expect(unsupported.reason).toBe('UNSUPPORTED')
      expect(unsupported.operationalConfidence).toBe(0)
    }

    const partial = evaluateProviderForRecommendation(WAVE_B_DESCRIPTORS.MarginFact)
    expect(partial).toEqual({
      ok: true,
      maxConfidence: 'MEDIUM',
      maxOperationalConfidence: 0.72,
    })

    const supported = evaluateProviderForRecommendation(WAVE_A_DESCRIPTORS.StockPositionFact)
    expect(supported).toEqual({
      ok: true,
      maxConfidence: 'HIGH',
      maxOperationalConfidence: 1,
    })
  })

  it('summarizeFactConfidence agrega transparência sem I/O', () => {
    const facts: FactEnvelope[] = [
      {
        factId: 'SaleFact',
        owner: 'sales',
        readiness: 'READY',
        observedAt: '2026-07-19T00:00:00.000Z',
        inputFingerprint: 'a',
        confidence: 'HIGH',
        operationalConfidence: 1,
        payload: {},
      },
      {
        factId: 'StockPositionFact',
        owner: 'inventory',
        readiness: 'READY',
        observedAt: '2026-07-19T00:00:00.000Z',
        inputFingerprint: 'b',
        confidence: 'HIGH',
        operationalConfidence: 1,
        payload: {},
      },
      {
        factId: 'MarginFact',
        owner: 'sales',
        readiness: 'PARTIAL',
        observedAt: '2026-07-19T00:00:00.000Z',
        inputFingerprint: 'c',
        confidence: 'MEDIUM',
        operationalConfidence: 0.72,
        payload: {},
      },
    ]
    const summary = summarizeFactConfidence(facts)
    expect(summary.supportedCount).toBe(2)
    expect(summary.partialCount).toBe(1)
    expect(summary.averageOperationalConfidencePercent).toBe(91)
    expect(summary.messageCode).toBe('intel.rec.summary_confidence')
  })

  it('descriptor exige confidence + wave (contrato Cycle 1)', () => {
    const d: FactProviderDescriptor = WAVE_A_DESCRIPTORS.ProductFact
    expect(d.operationalConfidence).toBeDefined()
    expect(d.wave).toBe('A')
  })
})
