import { buildDecisionIntelligenceReadModel } from '../read-model/build-read-model'
import type { DecisionRecordRepositoryPort } from '../ports/decision-record-repository'
import type { DecisionReadModelPort } from '../ports/decision-read-model'
import type { DecisionSnapshotRepositoryPort } from '../ports/decision-snapshot-repository'
import type { GovernedMemoryRepositoryPort } from '../ports/governed-memory-repository'

export type DecisionReadModelAdapterDeps = {
  snapshots: DecisionSnapshotRepositoryPort
  decisions: DecisionRecordRepositoryPort
  governedMemory?: GovernedMemoryRepositoryPort
}

/**
 * Adapter: I/O (repos) + builder puro.
 * Nenhuma regra de Analysis/Recommendation/Alert.
 */
export function createDecisionReadModelAdapter(
  deps: DecisionReadModelAdapterDeps,
): DecisionReadModelPort {
  return {
    async getForLoja(lojaId: string) {
      const [latest, records, governed] = await Promise.all([
        deps.snapshots.findLatestByLoja(lojaId),
        deps.decisions.listByLoja(lojaId),
        deps.governedMemory
          ? deps.governedMemory.listByLoja(lojaId)
          : Promise.resolve([]),
      ])

      if (!latest && records.length === 0 && governed.length === 0) return null

      return buildDecisionIntelligenceReadModel({
        snapshot: latest?.payload ?? null,
        records,
        governedMemory: governed,
        snapshotVersion: latest?.snapshotVersion ?? null,
      })
    },
  }
}
