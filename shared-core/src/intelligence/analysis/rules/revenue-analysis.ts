import { evidenceFrom, minConfidence, usableKpi } from '../kpi-access'
import type { AnalysisRule } from '../types'

/**
 * Padrões de receita — interpretação apenas (sem recomendar ação).
 */
export const zeroNetRevenueRule: AnalysisRule = {
  ruleId: 'ZERO_NET_REVENUE',
  domain: 'SALES',
  evaluate(ctx) {
    const net = usableKpi(ctx.byId, 'NetRevenue')
    if (!net) return 'SKIP_INSUFFICIENT'
    if ((net.value as number) !== 0) return null
    return {
      id: 'ZERO_NET_REVENUE',
      severity: 'WARNING',
      domain: 'SALES',
      titleCode: 'intel.analysis.zero_net_revenue.title',
      evidence: [evidenceFrom(net)],
      confidence: minConfidence([net]),
    }
  },
}

export const nonPositiveAverageTicketRule: AnalysisRule = {
  ruleId: 'NON_POSITIVE_AVERAGE_TICKET',
  domain: 'SALES',
  evaluate(ctx) {
    const ticket = usableKpi(ctx.byId, 'AverageTicket')
    if (!ticket) return 'SKIP_INSUFFICIENT'
    if ((ticket.value as number) > 0) return null
    return {
      id: 'NON_POSITIVE_AVERAGE_TICKET',
      severity: 'WARNING',
      domain: 'SALES',
      titleCode: 'intel.analysis.non_positive_average_ticket.title',
      evidence: [evidenceFrom(ticket)],
      confidence: minConfidence([ticket]),
    }
  },
}
