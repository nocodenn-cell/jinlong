import type {
  GovernedMemoryCreateInput,
  GovernedMemoryEntry,
} from '../models/governed-memory'

export type GovernedMemorySaveResult =
  | { ok: true; id: string }
  | { ok: false; code: string; message: string }

/**
 * Porta append-only — registra outcomes humanos na Memory governada.
 * Sem aprendizado implícito / sem alterar regras.
 */
export type GovernedMemoryRepositoryPort = {
  append(input: GovernedMemoryCreateInput): Promise<GovernedMemorySaveResult>
  listByLoja(lojaId: string, limit?: number): Promise<readonly GovernedMemoryEntry[]>
  listByDecisionId(
    decisionId: string,
  ): Promise<readonly GovernedMemoryEntry[]>
}
