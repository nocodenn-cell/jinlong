/**
 * Fixtures de teste — apenas contratos (W11).
 * Specs não devem importar engines irmãos para montar dados.
 */
import type { ActionPlan } from '../contracts/action-plan'
import type { Alert } from '../contracts/alert'
import type { AnalysisFinding } from '../contracts/analysis'
import type { MemorySnapshot } from '../contracts/memory-snapshot'
import type { Recommendation } from '../contracts/recommendation'
import type { Evidence } from '../types/evidence'

const defaultEvidence: Evidence = {
  kind: 'kpi',
  code: 'intel.test.evidence',
  kpiId: 'GrossMargin',
  observed: 0.12,
  confidence: 'MEDIUM',
}

export function fixtureFinding(
  partial: Pick<AnalysisFinding, 'id' | 'severity' | 'domain'> &
    Partial<AnalysisFinding>,
): AnalysisFinding {
  return {
    titleCode: `intel.analysis.${partial.id.toLowerCase()}.title`,
    evidence: [
      {
        kpiId: 'GrossMargin',
        value: 0.12,
        kpiStatus: 'SUPPORTED',
      },
    ],
    sourceFactIds: ['SaleFact'],
    operationalConfidence: 0.9,
    ...partial,
  }
}

export function fixtureRecommendation(
  partial: Pick<
    Recommendation,
    'id' | 'recommendationCode' | 'urgency' | 'operationalConfidence'
  > &
    Partial<Recommendation>,
): Recommendation {
  const sourceFindingIds = partial.sourceFindingIds ?? ['LOW_MARGIN']
  return {
    category: 'MARGIN',
    problemCode: sourceFindingIds[0] ?? 'LOW_MARGIN',
    evidences: [defaultEvidence],
    financialImpact: {
      metric: 'unestimated',
      estimate: { amount: 0, currency: 'BRL' },
      horizonDays: 0,
      confidence: 'LOW',
    },
    confidence: 'MEDIUM',
    recommendedAction: {
      actionCode: partial.recommendationCode,
    },
    justification: {
      causeCodes: [],
      assumptionCodes: [],
      limitations: [],
    },
    kpisUsed: [{ kpiId: 'GrossMargin', formulaVersion: '1.0.0' }],
    domainsConsulted: ['sales'],
    emittedAt: '2026-07-19T18:00:00.000Z',
    status: 'OPEN',
    sourceFindingIds,
    ruleId: 'REC_TEST',
    ruleVersion: '1.0.0',
    inputFingerprint: 'test',
    ...partial,
  }
}

export function fixtureAlert(
  partial: Pick<Alert, 'id' | 'sourceRecommendationIds' | 'sourceFindingIds'> &
    Partial<Alert>,
): Alert {
  return {
    detectorId: 'ALERT_TEST',
    detectorVersion: '1.0.0',
    sourceSlice: 'financial',
    severity: 'WARNING',
    severityJustificationCode: 'intel.alert.severity.test',
    titleCode: 'intel.alert.title.test',
    operationalConfidence: 0.9,
    urgency: { score: 70, reason: 'intel.alert.urgency.from_tier.P1' },
    impact: {
      metric: 'unestimated',
      descriptionCode: 'intel.alert.impact.test',
    },
    evidences: [defaultEvidence],
    scope: { storeId: 'loja-1' },
    window: {
      fromIso: '2026-06-19T18:00:00.000Z',
      toIso: '2026-07-19T18:00:00.000Z',
    },
    relatedKpis: ['GrossMargin'],
    status: 'OPEN',
    dedupeKey: `test:${partial.id}`,
    detectedAt: '2026-07-19T18:00:00.000Z',
    ...partial,
  }
}

/** Findings mínimos cobrindo as Recs (catálogo Action Plan). */
export function findingsForRecommendations(
  recommendations: readonly Recommendation[],
): AnalysisFinding[] {
  const ids = new Set<string>()
  for (const r of recommendations) {
    for (const id of r.sourceFindingIds) ids.add(id)
  }
  return [...ids].map((id) =>
    fixtureFinding({
      id,
      severity: 'WARNING',
      domain:
        id.includes('INVENTORY') || id.includes('STOCK') ? 'STOCK' : 'MARGIN',
      operationalConfidence: 0.9,
    }),
  )
}

export function fixtureActionPlan(
  partial: Pick<ActionPlan, 'id' | 'objectiveCode'> & Partial<ActionPlan>,
  recommendations: readonly Recommendation[] = [],
  alerts: readonly Alert[] = [],
): ActionPlan {
  const recs =
    recommendations.length > 0
      ? recommendations
      : [
          fixtureRecommendation({
            id: 'rec:fixture',
            recommendationCode: 'REVIEW_MARGIN_DRIVERS',
            urgency: 'P1',
            operationalConfidence: 0.9,
          }),
        ]
  const alertIds =
    alerts.length > 0
      ? alerts.map((a) => a.id)
      : [`alert:for:${recs[0]!.id}`]
  return {
    storeId: 'loja-1',
    planDate: '2026-07-19',
    items: recs.map((rec) => ({
      id: `plan-item:${partial.objectiveCode}:${rec.id}`,
      recommendationId: rec.id,
      titleCode: `intel.plan.item.${rec.recommendationCode.toLowerCase()}`,
      actionCode: rec.recommendedAction.actionCode,
      checklistLabelCode: `intel.plan.check.${rec.recommendationCode.toLowerCase()}`,
      urgency: rec.urgency,
      confidence: rec.confidence,
      operationalConfidence: rec.operationalConfidence,
      sourceFindingIds: [...rec.sourceFindingIds],
      sourceAlertIds: alertIds,
      status: 'TODO' as const,
    })),
    createdAt: '2026-07-19T18:00:00.000Z',
    sourceAlertIds: alertIds,
    sourceRecommendationIds: recs.map((r) => r.id),
    sourceFindingIds: uniqueFindings(recs),
    operationalConfidence: Math.min(
      ...recs.map((r) => r.operationalConfidence),
    ),
    urgency: 'P1',
    ruleId: 'PLAN_AGGREGATE_BY_OBJECTIVE',
    ruleVersion: '1.0.0',
    ...partial,
  }
}

function uniqueFindings(recs: readonly Recommendation[]): string[] {
  return [...new Set(recs.flatMap((r) => [...r.sourceFindingIds]))].sort()
}

export function fixtureMemorySnapshot(
  partial?: Partial<MemorySnapshot>,
): MemorySnapshot {
  return {
    storeId: 'loja-1',
    recordedAt: '2026-07-19T18:00:00.000Z',
    ruleId: 'MEMORY_PIPELINE_EMISSION',
    ruleVersion: '1.0.0',
    entries: [
      {
        id: 'mem:context:test',
        kind: 'CONTEXT',
        code: 'intel.memory.context.confidence_summary',
        relatedFindingIds: [],
        relatedRecommendationIds: [],
        relatedAlertIds: [],
        relatedActionPlanIds: [],
        noteCodes: ['intel.test'],
        operationalConfidence: 0,
      },
    ],
    pipelineFingerprint: 'test',
    operationalConfidence: 0.85,
    sourceFindingIds: [],
    sourceRecommendationIds: [],
    sourceAlertIds: [],
    sourceActionPlanIds: [],
    ...partial,
  }
}
