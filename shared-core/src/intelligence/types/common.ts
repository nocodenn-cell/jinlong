/**
 * Tipos transversais da Decision Intelligence (Cycle 0).
 * Sem I/O, sem regras de cálculo.
 */

/** Domínios operacionais consultáveis via ports (leitura). */
export type OperationalDomain =
  | 'sales'
  | 'financial'
  | 'inventory'
  | 'cash'
  | 'customers'
  | 'suppliers'
  | 'products'
  | 'audit'

/** Fatias de inteligência (ADR-011). */
export type IntelligenceSlice =
  | 'financial'
  | 'sales'
  | 'inventory'
  | 'customer'
  | 'supplier'
  | 'executive'

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNSUPPORTED'

/**
 * Confiança operacional ∈ [0, 1].
 * supportLevel = disponibilidade estrutural; isto = qualidade prática dos dados.
 */
export type OperationalConfidence = number

export type UrgencyTier = 'P0' | 'P1' | 'P2' | 'P3'

export type MoneyAmount = {
  amount: number
  currency: string
}

export type TimeWindow = {
  fromIso: string
  toIso: string
}

export type EntityRef = {
  kind:
    | 'sale'
    | 'sale_line'
    | 'product'
    | 'customer'
    | 'supplier'
    | 'ar_title'
    | 'ap_title'
    | 'stock'
    | 'cash_session'
    | 'other'
  id: string
}

/** Referência a evento operacional (não duplica o fato). */
export type OperationalEventRef = {
  source:
    | 'venda_eventos'
    | 'liquidacoes_receber'
    | 'contas_pagar_pagamentos'
    | 'movimentos_estoque_log'
    | 'movimentacoes_caixa'
    | 'system_alerts'
    | 'other'
  id: string
}
