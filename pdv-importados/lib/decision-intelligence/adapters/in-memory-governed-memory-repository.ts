import type {
  GovernedMemoryCreateInput,
  GovernedMemoryEntry,
} from '../models/governed-memory'
import type {
  GovernedMemoryRepositoryPort,
  GovernedMemorySaveResult,
} from '../ports/governed-memory-repository'

function newId(): string {
  return `mem-gov-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createInMemoryGovernedMemoryRepository(): GovernedMemoryRepositoryPort & {
  _all(): readonly GovernedMemoryEntry[]
} {
  const rows: GovernedMemoryEntry[] = []

  return {
    _all() {
      return rows
    },

    async append(input: GovernedMemoryCreateInput): Promise<GovernedMemorySaveResult> {
      if (!input.lojaId || !input.decisionId) {
        return {
          ok: false,
          code: 'DI_GOV_MEMORY_INVALID',
          message: 'lojaId e decisionId são obrigatórios',
        }
      }
      const id = newId()
      rows.push({
        id,
        lojaId: input.lojaId,
        decisionId: input.decisionId,
        recommendationId: input.recommendationId,
        eventKind: input.eventKind,
        decisionStatus: input.decisionStatus,
        decisionReason: input.decisionReason,
        noteCodes: [...input.noteCodes],
        metricCode: input.metricCode ?? null,
        expectedValue: input.expectedValue ?? null,
        actualValue: input.actualValue ?? null,
        recordedAt: input.recordedAt ?? new Date().toISOString(),
        actorId: input.actorId ?? null,
      })
      return { ok: true, id }
    },

    async listByLoja(lojaId: string, limit = 200) {
      return rows
        .filter((r) => r.lojaId === lojaId)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
        .slice(0, limit)
    },

    async listByDecisionId(decisionId: string) {
      return rows.filter((r) => r.decisionId === decisionId)
    },
  }
}
