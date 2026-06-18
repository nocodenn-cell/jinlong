import type { JournalEntry, PostedEntry } from './types'

/**
 * Porta hexagonal do razão contábil.
 * Implementações: InMemoryLedger (testes), SupabaseLedger (produção — próxima fase).
 * Invariante: nunca permite UPDATE ou DELETE de entradas já lançadas.
 */
export interface LedgerPort {
  /** Persiste a entrada no razão. Deve ser chamado após validateEntry(). */
  postEntry(entry: JournalEntry): Promise<PostedEntry>
  /** Retorna todas as entradas que tocam uma conta específica. */
  getEntriesForAccount(accountId: string): Promise<readonly PostedEntry[]>
  /** Retorna todas as entradas em ordem de lançamento. */
  getAllEntries(): Promise<readonly PostedEntry[]>
}
