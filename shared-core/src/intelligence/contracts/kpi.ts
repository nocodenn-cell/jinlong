import type { FactId } from '../facts/definitions'
import type { IntelligenceSlice } from '../types/common'

/**
 * Contrato de definição de KPI (Cycle 0).
 * Catálogo analítico versionado — sem fórmulas executáveis neste cycle.
 */

export type KpiId = string

export type KpiDefinition = {
  kpiId: KpiId
  /** Versão da fórmula conceitual (ADR-011 / FINANCIAL_INTELLIGENCE). */
  formulaVersion: string
  /** Fatia que publica o KPI (não o dono do fato bruto). */
  slice: IntelligenceSlice
  /** Facts canônicos dos quais o KPI depende. */
  dependsOnFacts: readonly FactId[]
  /**
   * Gates que devem estar satisfeitos para confidence HIGH.
   * Ver `gates/data-readiness.ts`.
   */
  dependsOnGates?: readonly string[]
  /** Code estável de descrição; prosa na borda i18n. */
  descriptionCode: string
}

/** Valor publicado de um KPI — shape apenas. */
export type KpiValue = {
  kpiId: KpiId
  formulaVersion: string
  value: number | null
  unit?: string
  currency?: string
  computedAt: string
  inputFingerprint: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNSUPPORTED'
  /** Quando valor é null por gate — referência explícita. */
  blockedByGateIds?: readonly string[]
}
