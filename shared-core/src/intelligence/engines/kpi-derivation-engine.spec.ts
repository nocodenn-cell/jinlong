import { describe, expect, it } from 'vitest'
import {
  KPI_IDS,
  WAVE_A_DESCRIPTORS,
  WAVE_B_DESCRIPTORS,
  createInMemoryFactProvider,
  deriveKpis,
  envelopeStub,
  propagateOperationalConfidence,
  runEngineLoop,
  type FactEnvelope,
} from '../index'

function sale(storeId = 'loja-1', net = 100, gross = 120): FactEnvelope {
  return envelopeStub({
    factId: 'SaleFact',
    owner: 'sales',
    readiness: 'READY',
    storeId,
    confidence: 'HIGH',
    operationalConfidence: 1,
    inputFingerprint: `sale:${net}`,
    payload: { grossAmount: gross, netAmount: net, discountAmount: gross - net },
  })
}

function marginPartial(): FactEnvelope {
  return envelopeStub({
    factId: 'MarginFact',
    owner: 'sales',
    readiness: 'PARTIAL',
    confidence: 'MEDIUM',
    operationalConfidence: 0.72,
    inputFingerprint: 'margin:1',
    payload: {
      netRevenue: 200,
      estimatedCost: 80,
      costReliable: true,
    },
  })
}

describe('KPI Derivation Engine (Cycle 2)', () => {
  it('registry cobre todos os KPIs do catálogo Cycle 2', () => {
    expect(KPI_IDS.length).toBe(16)
  })

  it('propaga confiança pelo weakest link (mínimo)', () => {
    const facts = [
      envelopeStub({
        factId: 'SaleFact',
        owner: 'sales',
        readiness: 'READY',
        confidence: 'HIGH',
        operationalConfidence: 1,
      }),
      envelopeStub({
        factId: 'SaleFact',
        owner: 'sales',
        readiness: 'READY',
        confidence: 'HIGH',
        operationalConfidence: 0.82,
        inputFingerprint: 'sale:b',
      }),
    ]
    expect(propagateOperationalConfidence(facts)).toBe(0.82)
  })

  it('deriva GrossRevenue / NetRevenue / AverageTicket a partir de SaleFact SUPPORTED', () => {
    const result = deriveKpis({
      storeId: 'loja-1',
      factsUsed: [sale('loja-1', 100, 120), sale('loja-1', 50, 60)],
      factsPartialIdentified: [],
      factsBlocked: [],
      requestedAt: '2026-07-19T18:00:00.000Z',
    })

    const gross = result.derivedKpis.find((k) => k.id === 'GrossRevenue')
    const net = result.derivedKpis.find((k) => k.id === 'NetRevenue')
    const ticket = result.derivedKpis.find((k) => k.id === 'AverageTicket')

    expect(gross?.status).toBe('SUPPORTED')
    expect(gross?.value).toBe(180)
    expect(gross?.operationalConfidence).toBe(1)
    expect(net?.value).toBe(150)
    expect(ticket?.value).toBe(75)
    expect(result.supportedKpis.some((k) => k.id === 'GrossRevenue')).toBe(true)
    expect(result.kpiValues.some((k) => k.kpiId === 'GrossRevenue' && k.value === 180)).toBe(
      true,
    )
  })

  it('KPI PARTIAL quando depende de MarginFact PARTIAL', () => {
    const result = deriveKpis({
      storeId: 'loja-1',
      factsUsed: [],
      factsPartialIdentified: [marginPartial()],
      factsBlocked: [],
      requestedAt: '2026-07-19T18:00:00.000Z',
    })

    const gm = result.derivedKpis.find((k) => k.id === 'GrossMargin')
    const gp = result.derivedKpis.find((k) => k.id === 'GrossProfit')
    expect(gm?.status).toBe('PARTIAL')
    expect(gm?.supportLevel).toBe('PARTIAL')
    expect(gm?.operationalConfidence).toBe(0.72)
    expect(gm?.value).toBe(0.6)
    expect(gp?.value).toBe(120)
    expect(result.partialKpis.map((k) => k.id)).toEqual(
      expect.arrayContaining(['GrossMargin', 'GrossProfit']),
    )
  })

  it('KPI BLOCKED quando Fact requerido é UNSUPPORTED — value null', () => {
    const result = deriveKpis({
      storeId: 'loja-1',
      factsUsed: [sale()],
      factsPartialIdentified: [],
      factsBlocked: [
        {
          factId: 'CustomerPurchaseFact',
          supportLevel: 'UNSUPPORTED',
          reason: 'UNSUPPORTED',
          gateIds: ['GATE_CUSTOMER_SALE_LINK'],
          explanationCode: 'intel.provider.customer_purchase.unsupported',
        },
      ],
      requestedAt: '2026-07-19T18:00:00.000Z',
    })

    const churn = result.derivedKpis.find((k) => k.id === 'CustomerChurn')
    const ltv = result.derivedKpis.find((k) => k.id === 'CustomerLtv')
    expect(churn?.status).toBe('BLOCKED')
    expect(churn?.value).toBeNull()
    expect(ltv?.status).toBe('BLOCKED')
    expect(result.blockedKpis.some((k) => k.id === 'CustomerChurn')).toBe(true)
    expect(result.supportedKpis.some((k) => k.id === 'CustomerChurn')).toBe(false)
    expect(result.kpiValues.some((k) => k.kpiId === 'CustomerChurn')).toBe(false)
  })

  it('nunca inventa valor quando payload insuficiente', () => {
    const result = deriveKpis({
      storeId: 'loja-1',
      factsUsed: [
        envelopeStub({
          factId: 'SaleFact',
          owner: 'sales',
          readiness: 'READY',
          confidence: 'HIGH',
          operationalConfidence: 1,
          payload: {},
        }),
      ],
      factsPartialIdentified: [],
      factsBlocked: [],
      requestedAt: '2026-07-19T18:00:00.000Z',
    })
    const gross = result.derivedKpis.find((k) => k.id === 'GrossRevenue')
    expect(gross?.value).toBeNull()
    expect(gross?.status).toBe('UNAVAILABLE')
  })

  it('snapshot do Engine Loop expõe buckets de KPI consistentes', async () => {
    const snapshot = await runEngineLoop({
      storeId: 'loja-1',
      providers: [
        createInMemoryFactProvider(WAVE_A_DESCRIPTORS.SaleFact, [sale()]),
        createInMemoryFactProvider(WAVE_B_DESCRIPTORS.MarginFact, [marginPartial()]),
        createInMemoryFactProvider(WAVE_B_DESCRIPTORS.CustomerPurchaseFact, [
          envelopeStub({
            factId: 'CustomerPurchaseFact',
            owner: 'composite',
            readiness: 'BLOCKED',
            confidence: 'UNSUPPORTED',
            operationalConfidence: 0,
          }),
        ]),
      ],
      now: () => new Date('2026-07-19T18:00:00.000Z'),
    })

    expect(snapshot.derivedKpis).toHaveLength(KPI_IDS.length)
    expect(snapshot.supportedKpis.some((k) => k.id === 'NetRevenue')).toBe(true)
    expect(snapshot.partialKpis.some((k) => k.id === 'GrossMargin')).toBe(true)
    expect(snapshot.blockedKpis.some((k) => k.id === 'CustomerChurn')).toBe(true)
    expect(snapshot.metrics.kpisSupported).toBeGreaterThan(0)
    expect(snapshot.metrics.kpisPartial).toBeGreaterThan(0)
    expect(snapshot.metrics.kpisBlocked).toBeGreaterThan(0)
  })
})
