import { describe, expect, it } from 'vitest'
import type { Alert } from '../contracts/alert'
import { fixtureRecommendation } from '../testing'
import {
  assertAlertDeterminism,
  buildAlertFromRecommendation,
  computeAlertUrgency,
  listAlertDetectorIds,
  planSeverityFromRecommendation,
  runAlertEngine,
} from './index'

describe('Alert Engine (Cycle 5)', () => {
  it('registry de detectors está carregado', () => {
    expect(listAlertDetectorIds()).toContain(
      'ALERT_ATTENTION_FROM_RECOMMENDATION',
    )
  })

  it('Recommendation → Alert com sourceRecommendationIds e sourceFindingIds', () => {
    const rec = fixtureRecommendation({
      id: 'rec:REVIEW_MARGIN_DRIVERS:LOW_MARGIN',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P1',
      operationalConfidence: 0.9,
      sourceFindingIds: ['LOW_MARGIN'],
    })

    const snapshot = runAlertEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      recommendations: [rec],
    })

    expect(snapshot.alerts).toHaveLength(1)
    const alert = snapshot.alerts[0]!
    expect(alert.sourceRecommendationIds).toEqual([rec.id])
    expect(alert.sourceFindingIds).toEqual(['LOW_MARGIN'])
    expect(alert.evidences.length).toBeGreaterThan(0)
    expect(() => assertAlertDeterminism(alert, [rec])).not.toThrow()
  })

  it('propaga confidence da Recommendation', () => {
    const rec = fixtureRecommendation({
      id: 'rec:1',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P0',
      operationalConfidence: 0.55,
    })
    const snapshot = runAlertEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      recommendations: [rec],
    })
    expect(snapshot.alerts[0]?.operationalConfidence).toBe(0.55)
  })

  it('urgency CRITICAL não inflaciona confidence baixa', () => {
    const rec = fixtureRecommendation({
      id: 'rec:weak',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P0',
      operationalConfidence: 0.4,
    })
    const alert = runAlertEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      recommendations: [rec],
    }).alerts[0]!
    expect(alert.severity).toBe('CRITICAL')
    expect(alert.urgency.score).toBe(90)
    expect(alert.operationalConfidence).toBe(0.4)
  })

  it('cálculo de urgência mapeia tiers P0–P3', () => {
    expect(
      computeAlertUrgency(
        fixtureRecommendation({
          id: 'a',
          recommendationCode: 'REVIEW_MARGIN_DRIVERS',
          urgency: 'P0',
          operationalConfidence: 1,
        }),
      ).score,
    ).toBe(90)
    expect(
      planSeverityFromRecommendation(
        fixtureRecommendation({
          id: 'c',
          recommendationCode: 'REVIEW_INVENTORY_CAPITAL',
          urgency: 'P1',
          operationalConfidence: 1,
        }),
      ).severity,
    ).toBe('WARNING')
  })

  it('skip quando Recommendation não tem evidence', () => {
    const rec = fixtureRecommendation({
      id: 'rec:empty',
      recommendationCode: 'REVIEW_SALES_ACTIVITY',
      urgency: 'P1',
      operationalConfidence: 0.8,
      evidences: [],
    })
    const snapshot = runAlertEngine({
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      recommendations: [rec],
    })
    expect(snapshot.alerts).toEqual([])
    expect(snapshot.skipped).toBe(1)
  })

  it('guard rejeita alert sem sourceFindingIds', () => {
    const rec = fixtureRecommendation({
      id: 'rec:1',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P1',
      operationalConfidence: 0.9,
    })
    const alert = buildAlertFromRecommendation({
      recommendation: rec,
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      contextWindowDays: 30,
      detectorId: 'ALERT_ATTENTION_FROM_RECOMMENDATION',
      detectorVersion: '1.0.0',
    })
    const broken: Alert = { ...alert, sourceFindingIds: [] }
    expect(() => assertAlertDeterminism(broken, [rec])).toThrow(
      /INTEL_ALERT_NO_FINDING/,
    )
  })

  it('guard rejeita inflação de confidence', () => {
    const rec = fixtureRecommendation({
      id: 'rec:1',
      recommendationCode: 'REVIEW_MARGIN_DRIVERS',
      urgency: 'P0',
      operationalConfidence: 0.4,
    })
    const alert = buildAlertFromRecommendation({
      recommendation: rec,
      storeId: 'loja-1',
      requestedAt: '2026-07-19T18:00:00.000Z',
      contextWindowDays: 30,
      detectorId: 'ALERT_ATTENTION_FROM_RECOMMENDATION',
      detectorVersion: '1.0.0',
    })
    const inflated: Alert = { ...alert, operationalConfidence: 0.9 }
    expect(() => assertAlertDeterminism(inflated, [rec])).toThrow(
      /INTEL_ALERT_CONFIDENCE_INFLATED/,
    )
  })
})
