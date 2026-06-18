import type { LedgerPort } from '../LedgerPort'
import type { JournalEntry, PostedEntry } from '../types'

/**
 * Adapter append-only em memória — para testes unitários e integração.
 * Nunca expõe métodos de remoção ou atualização.
 * Adapter Supabase (produção) será implementado na fase de hardening.
 */
export class InMemoryLedger implements LedgerPort {
  private readonly _journal: PostedEntry[] = []

  async postEntry(entry: JournalEntry): Promise<PostedEntry> {
    const posted: PostedEntry = { entry, postedAt: new Date() }
    this._journal.push(posted)
    return posted
  }

  async getEntriesForAccount(accountId: string): Promise<readonly PostedEntry[]> {
    return this._journal.filter(p =>
      p.entry.lines.some(l => l.account.id === accountId)
    )
  }

  async getAllEntries(): Promise<readonly PostedEntry[]> {
    return [...this._journal]
  }
}
