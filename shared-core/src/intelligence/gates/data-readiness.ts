import type { FactId } from '../facts/definitions'

/**
 * Gates canônicos de dados (Cycle 0).
 *
 * NÃO contornar com cálculos alternativos ou fontes temporárias.
 * SSoT > velocidade (DECISION_FACT_CATALOG §15 + missão Cycle 0).
 */

export const DI_GATE_IDS = [
  'GATE_CUSTOMER_SALE_LINK',
  'GATE_MARGIN_COST_RELIABLE',
  'GATE_STOCK_CAPITAL_KARDEX_COST',
  'GATE_DATABASE_TYPES_STALE',
] as const

export type DiGateId = (typeof DI_GATE_IDS)[number]

export type DiGateStatus = 'OPEN' | 'SATISFIED'

export type DiGateKind =
  /** Impede KPI/rec com confidence alta até o dono corrigir o dado. */
  | 'data_quality'
  /** Bloqueia adapters I/O tipados; não inventa semântica alternativa. */
  | 'platform_io'

export type DiDataGate = {
  gateId: DiGateId
  kind: DiGateKind
  /** OPEN = lacuna ativa; SATISFIED só quando a causa raiz for resolvida no dono. */
  status: DiGateStatus
  summaryCode: string
  /** Facts degradados ou bloqueados enquanto OPEN. */
  affectsFacts: readonly FactId[]
  /**
   * Ciclos que NÃO podem emitir valor HIGH / bypass
   * enquanto o gate estiver OPEN.
   */
  blocksCycles: readonly string[]
  remediationOwner: string
}

/**
 * Estado documental atual das lacunas.
 * Atualizar `status` para SATISFIED somente com evidência no domínio dono
 * (não com workaround em DI).
 */
export const DI_DATA_GATES: Record<DiGateId, DiDataGate> = {
  GATE_CUSTOMER_SALE_LINK: {
    gateId: 'GATE_CUSTOMER_SALE_LINK',
    kind: 'data_quality',
    status: 'OPEN',
    summaryCode: 'intel.gate.customer_sale_link',
    affectsFacts: ['CustomerPurchaseFact', 'SaleCustomerLinkFact'],
    blocksCycles: ['kpi:ltv', 'kpi:churn', 'kpi:purchase_frequency', 'rec:customer_churn'],
    remediationOwner: 'sales + customers (cobertura venda_finance_context / link estável)',
  },
  GATE_MARGIN_COST_RELIABLE: {
    gateId: 'GATE_MARGIN_COST_RELIABLE',
    kind: 'data_quality',
    status: 'OPEN',
    summaryCode: 'intel.gate.margin_cost_reliable',
    affectsFacts: ['MarginFact'],
    blocksCycles: ['kpi:margin', 'kpi:gross_profit', 'rec:margin'],
    remediationOwner: 'sales (custo_unitario_snap + costReliable)',
  },
  GATE_STOCK_CAPITAL_KARDEX_COST: {
    gateId: 'GATE_STOCK_CAPITAL_KARDEX_COST',
    kind: 'data_quality',
    status: 'OPEN',
    summaryCode: 'intel.gate.stock_capital_kardex_cost',
    affectsFacts: ['StockCapitalFact'],
    blocksCycles: ['kpi:immobilized_capital'],
    remediationOwner: 'inventory + products (custo no kardex ou política canônica explícita)',
  },
  GATE_DATABASE_TYPES_STALE: {
    gateId: 'GATE_DATABASE_TYPES_STALE',
    kind: 'platform_io',
    /** SATISFIED — regenerado a partir do schema local (Foundation Hardening 2026-07-19). */
    status: 'SATISFIED',
    summaryCode: 'intel.gate.database_types_stale',
    affectsFacts: [
      'SaleEventFact',
      'SaleCustomerLinkFact',
      'CustomerPurchaseFact',
      'InventoryMovementFact',
    ],
    blocksCycles: ['cycle1:fact_providers_io'],
    remediationOwner: 'platform (regenerar database.types.ts a partir das migrations)',
  },
}

export function listOpenGates(): readonly DiDataGate[] {
  return DI_GATE_IDS.map((id) => DI_DATA_GATES[id]).filter((g) => g.status === 'OPEN')
}

export function gatesAffectingFact(factId: FactId): readonly DiDataGate[] {
  return DI_GATE_IDS.map((id) => DI_DATA_GATES[id]).filter((g) =>
    g.affectsFacts.includes(factId),
  )
}

/**
 * Consumo analítico permitido?
 * — READY sem gate OPEN: sim
 * — CONTEXT: só contexto (não KPI empresarial sozinho)
 * — PARTIAL/BLOCKED com gate OPEN: não emitir como SSoT; confidence máxima UNSUPPORTED
 *
 * Não fornece cálculo alternativo.
 */
export type FactConsumptionVerdict =
  | { ok: true; maxConfidence: 'HIGH' | 'MEDIUM' }
  | { ok: false; reason: 'GATE_OPEN' | 'BLOCKED' | 'CONTEXT_ONLY'; gateIds: readonly DiGateId[] }

export function evaluateFactConsumption(
  factId: FactId,
  readiness: 'READY' | 'PARTIAL' | 'BLOCKED' | 'CONTEXT',
): FactConsumptionVerdict {
  const openQuality = gatesAffectingFact(factId).filter(
    (g) => g.status === 'OPEN' && g.kind === 'data_quality',
  )
  const gateIds = openQuality.map((g) => g.gateId)

  if (readiness === 'CONTEXT') {
    return { ok: false, reason: 'CONTEXT_ONLY', gateIds }
  }
  if (readiness === 'BLOCKED') {
    return { ok: false, reason: 'BLOCKED', gateIds }
  }
  if (openQuality.length > 0) {
    return { ok: false, reason: 'GATE_OPEN', gateIds }
  }
  if (readiness === 'PARTIAL') {
    return { ok: true, maxConfidence: 'MEDIUM' }
  }
  return { ok: true, maxConfidence: 'HIGH' }
}

/** Cycle 1 I/O: false enquanto database.types estiver defasado. */
export function isFactProviderIoAllowed(): boolean {
  return DI_DATA_GATES.GATE_DATABASE_TYPES_STALE.status === 'SATISFIED'
}
