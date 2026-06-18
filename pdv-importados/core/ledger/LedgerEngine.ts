import type { LedgerPort } from './LedgerPort'
import type { JournalEntry, PostedEntry } from './types'
import { validateEntry } from './validateEntry'
import { actionOk } from '@shared-core/src/result/actionResult'
import type { ActionResult } from '@shared-core/src/result/actionResult'

/**
 * Wrapper sobre LedgerPort que aplica validateEntry antes de persistir.
 * É o único ponto de entrada para lançamentos no razão.
 */
export class LedgerEngine {
  constructor(private readonly port: LedgerPort) {}

  async postEntry(entry: JournalEntry): Promise<ActionResult<PostedEntry>> {
    const valid = validateEntry(entry)
    if (!valid.ok) return valid
    const posted = await this.port.postEntry(entry)
    return actionOk(posted)
  }

  async getEntriesForAccount(accountId: string): Promise<readonly PostedEntry[]> {
    return this.port.getEntriesForAccount(accountId)
  }

  async getAllEntries(): Promise<readonly PostedEntry[]> {
    return this.port.getAllEntries()
  }
}
