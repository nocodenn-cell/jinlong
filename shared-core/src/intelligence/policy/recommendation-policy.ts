/**
 * Limites organizacionais da Recommendation (Cycle 4).
 * Política LIMITA emissão — não decide conteúdo comercial.
 * Proibido: if margin < X then Y (isso é Analysis/Recommendation ou Action Plan).
 */

/** Confiança mínima para emitir recommendation. */
export const MIN_RECOMMENDATION_OPERATIONAL_CONFIDENCE = 0.5

/**
 * Action codes operacionais banidos (piloto automático / decisão comercial).
 * Recommendations sugerem REVISÃO, não mutação.
 */
export const FORBIDDEN_OPERATIONAL_ACTION_CODES = [
  'increase_product_price',
  'INCREASE_PRODUCT_PRICE',
  'decrease_product_price',
  'DECREASE_PRODUCT_PRICE',
  'auto_reprice',
  'AUTO_REPRICE',
  'force_purchase_order',
  'FORCE_PURCHASE_ORDER',
  'auto_liquidate_stock',
  'AUTO_LIQUIDATE_STOCK',
] as const

export type ForbiddenOperationalActionCode =
  (typeof FORBIDDEN_OPERATIONAL_ACTION_CODES)[number]

export function isForbiddenOperationalAction(actionCode: string): boolean {
  return (FORBIDDEN_OPERATIONAL_ACTION_CODES as readonly string[]).includes(
    actionCode,
  )
}
