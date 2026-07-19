import type {
  EntityRef,
  IntelligenceSlice,
  MoneyAmount,
  TimeWindow,
} from '../types/common'
import type { Evidence } from '../types/evidence'
import type { KpiId } from './kpi'

/**
 * Alert Contract — ADR-011.
 * Cycle 0: contrato apenas. Sem detectors.
 */

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SNOOZED'

export type AlertImpact = {
  metric: string
  magnitude?: MoneyAmount | number
  horizonDays?: number
  descriptionCode: string
}

export type AlertSuggestedAction = {
  actionCode: string
  deepLinkHint?: string
  recommendationId?: string
}

export type AlertScope = {
  storeId: string
  entityRef?: EntityRef
}

/**
 * Alerta derivado. Integração com Auditoria = correlação por refs,
 * sem duplicar fatos operacionais (ADR-011).
 */
export type Alert = {
  id: string
  /** Origem */
  detectorId: string
  detectorVersion: string
  sourceSlice: IntelligenceSlice
  severity: AlertSeverity
  impact: AlertImpact
  evidences: readonly Evidence[]
  suggestedAction?: AlertSuggestedAction
  scope: AlertScope
  window: TimeWindow
  relatedKpis: readonly KpiId[]
  status: AlertStatus
  dedupeKey: string
  detectedAt: string
  /** Refs a timeline operacional — não substituem /admin/auditoria */
  operationalEventRefs?: readonly {
    source: string
    id: string
  }[]
}
