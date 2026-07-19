/**
 * Mapa Recommendation → objectiveCode (agregação Cycle 6).
 */

export const OBJECTIVE_BY_RECOMMENDATION: Readonly<
  Record<string, string>
> = {
  REVIEW_MARGIN_DRIVERS: 'REVIEW_CRITICAL_MARGINS',
  REVIEW_SALES_ACTIVITY: 'REVIEW_SALES_ACTIVITY',
  REVIEW_INVENTORY_CAPITAL: 'REVIEW_INVENTORY_CAPITAL',
}

export function objectiveForRecommendationCode(
  recommendationCode: string,
): string | null {
  return OBJECTIVE_BY_RECOMMENDATION[recommendationCode] ?? null
}
