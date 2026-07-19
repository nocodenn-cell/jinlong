import type { ConfidenceLevel, EntityRef, OperationalEventRef, TimeWindow } from './common'
import type { FactId } from '../facts/definitions'
import type { KpiId } from '../contracts/kpi'

/**
 * Evidência explicável — obrigatória em Recommendation e Alert (ADR-011).
 */
export type EvidenceKind = 'fact' | 'kpi' | 'event' | 'baseline' | 'limitation'

export type Evidence = {
  kind: EvidenceKind
  /** Code estável; prosa na borda i18n. */
  code: string
  factId?: FactId
  kpiId?: KpiId
  entityRef?: EntityRef
  eventRef?: OperationalEventRef
  window?: TimeWindow
  /** Valor observável tipado (número, string ISO, etc.) — sem fórmula embutida. */
  observed?: string | number | boolean | null
  confidence?: ConfidenceLevel
  noteCode?: string
}
