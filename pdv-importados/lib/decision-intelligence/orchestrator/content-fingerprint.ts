import { createHash } from 'node:crypto'
import type { DecisionSnapshot } from '@shared-core/src/intelligence'

/**
 * Fingerprint de conteúdo estável — exclui timestamps do ciclo.
 * Usado só para idempotência do orquestrador (fora do Core).
 * O pipelineFingerprint do Memory inclui requestedAt e muda a cada execução.
 */
export function computeSnapshotContentFingerprint(
  snapshot: DecisionSnapshot,
): string {
  const facts = [
    ...snapshot.factsUsed.map((f) => `${f.factId}:${f.inputFingerprint}`),
    ...snapshot.factsPartialIdentified.map(
      (f) => `${f.factId}:${f.inputFingerprint}:partial`,
    ),
    ...snapshot.factsBlocked.map((f) => `${f.factId}:${f.reason}`),
  ].sort()

  const kpis = snapshot.derivedKpis
    .map((k) => `${k.id}:${k.status}:${k.inputFingerprint}`)
    .sort()

  const findings = snapshot.analysis.findings.map((f) => f.id).sort()
  const recommendations = snapshot.recommendations.map((r) => r.id).sort()
  const alerts = snapshot.alerts.map((a) => a.id).sort()
  const plans = snapshot.actionPlans.map((p) => p.id).sort()

  const stable = JSON.stringify({
    storeId: snapshot.storeId,
    facts,
    kpis,
    findings,
    recommendations,
    alerts,
    plans,
  })

  return createHash('sha256').update(stable).digest('hex')
}
