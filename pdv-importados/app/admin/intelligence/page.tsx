/**
 * FastProduct Admin — Decision Intelligence Cockpit (Fase 4)
 *
 * Server Component. Consome exclusivamente o Read Model via
 * `loadIntelligenceReadModel` → `DecisionReadModelPort`.
 * Sem acesso direto a DecisionSnapshot / DecisionRecord.
 * Sem recalcular KPIs, Findings, Recommendations, Alerts ou Action Plans.
 * Navegação apenas por deep links entity-SSoT.
 */

import { PageHeader } from '@/components/ui/admin-v2'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { loadIntelligenceReadModel } from '@/lib/admin/intelligence/loadIntelligenceReadModel'
import { ROUTES } from '@shared-core/navigation/routes'
import { EmptyIntelligenceState } from './_components/EmptyIntelligenceState'
import { IntelligenceCockpit } from './_components/IntelligenceCockpit'

export default async function AdminIntelligencePage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.intelligence,
    resource: `route:${ROUTES.admin.intelligence}`,
  })

  const lojaId = session.lojaId?.trim() ?? ''
  const model = lojaId ? await loadIntelligenceReadModel(lojaId) : null

  return (
    <div className="admin-v2-page">
      <PageHeader
        title="Inteligência de decisões"
        subtitle="Cockpit somente leitura — projeções do Read Model. Inferência permanece no Core."
      />
      {model ? <IntelligenceCockpit model={model} /> : <EmptyIntelligenceState />}
    </div>
  )
}
