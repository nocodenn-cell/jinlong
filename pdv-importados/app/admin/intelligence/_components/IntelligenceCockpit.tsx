import type { DecisionIntelligenceReadModel } from '@/lib/decision-intelligence'
import { CriticalAlertsPanel } from './CriticalAlertsPanel'
import { DailyActionPlanPanel } from './DailyActionPlanPanel'
import { DecisionHistoryPanel } from './DecisionHistoryPanel'
import { DecisionPerformancePanel } from './DecisionPerformancePanel'
import { ExecutiveDashboardPanel } from './ExecutiveDashboardPanel'
import { GovernedMemoryPanel } from './GovernedMemoryPanel'
import { PendingReviewsPanel } from './PendingReviewsPanel'
import { RecommendationQueuePanel } from './RecommendationQueuePanel'

type Props = { model: DecisionIntelligenceReadModel }

/**
 * Layout do cockpit — um painel por projeção.
 * Nenhuma regra de negócio; só composição visual.
 */
export function IntelligenceCockpit({ model }: Props) {
  return (
    <div className="admin-v2-stack space-y-4">
      <p className="text-caption text-fg-subtle">
        Loja {model.storeId} · projetado em {model.projectedAt}
        {model.snapshotRequestedAt
          ? ` · snapshot ${model.snapshotRequestedAt}`
          : ''}
      </p>
      <ExecutiveDashboardPanel data={model.executiveDashboard} />
      <div className="grid gap-4 xl:grid-cols-2">
        <CriticalAlertsPanel data={model.criticalAlerts} />
        <PendingReviewsPanel data={model.pendingReviews} />
      </div>
      <RecommendationQueuePanel data={model.recommendationQueue} />
      <DailyActionPlanPanel data={model.dailyActionPlan} />
      <div className="grid gap-4 xl:grid-cols-2">
        <DecisionHistoryPanel data={model.decisionHistory} />
        <DecisionPerformancePanel data={model.decisionPerformance} />
      </div>
      <GovernedMemoryPanel data={model.governedMemory} />
    </div>
  )
}
