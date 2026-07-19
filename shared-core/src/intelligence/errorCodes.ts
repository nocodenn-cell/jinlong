/**
 * Códigos estáveis DI — prosa na borda i18n (ADR-005 §6 / ADR-011).
 */

export const INTELLIGENCE_ERROR_CODES = [
  'INTEL_FACT_GATE_OPEN',
  'INTEL_FACT_BLOCKED',
  'INTEL_FACT_CONTEXT_ONLY',
  'INTEL_FACT_UNKNOWN',
  'INTEL_PROVIDER_IO_GATED',
  'INTEL_RECOMMENDATION_NO_EVIDENCE',
  'INTEL_CONTRACT_INVARIANT',
] as const

export type IntelligenceErrorCode = (typeof INTELLIGENCE_ERROR_CODES)[number]
