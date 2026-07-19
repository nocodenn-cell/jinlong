import { isForbiddenOperationalAction } from './recommendation-policy'

/** Action codes extras banidos no Action Plan (mutação operacional). */
export const FORBIDDEN_ACTION_PLAN_CODES = [
  'update_price',
  'UPDATE_PRICE',
  'create_purchase_order',
  'CREATE_PURCHASE_ORDER',
  'liquidate_stock',
  'LIQUIDATE_STOCK',
] as const

export function isForbiddenActionPlanCode(actionCode: string): boolean {
  if (isForbiddenOperationalAction(actionCode)) return true
  return (FORBIDDEN_ACTION_PLAN_CODES as readonly string[]).includes(actionCode)
}

/** Só permite códigos de revisão / validação / conferência. */
export function isOrganizingActionCode(actionCode: string): boolean {
  const upper = actionCode.toUpperCase()
  return (
    upper.startsWith('REVIEW_') ||
    upper.startsWith('VALIDATE_') ||
    upper.startsWith('CHECK_') ||
    upper.startsWith('CONFER')
  )
}
