import type { LedgerPort } from './LedgerPort'
import type { Cents } from './types'

/**
 * Saldo de uma conta calculado sobre todas as entradas do razão.
 * Contas com normalBalance=DEBIT (ASSET, EXPENSE): DEBIT aumenta, CREDIT diminui.
 * Contas com normalBalance=CREDIT (LIABILITY, EQUITY, REVENUE): CREDIT aumenta, DEBIT diminui.
 * O valor retornado é sempre a soma bruta dos débitos menos créditos (saldo T-account).
 */
export async function getAccountBalance(
  ledger: LedgerPort,
  accountId: string,
): Promise<Cents> {
  const entries = await ledger.getEntriesForAccount(accountId)
  let balance = 0
  for (const posted of entries) {
    for (const line of posted.entry.lines) {
      if (line.account.id !== accountId) continue
      balance += line.direction === 'DEBIT' ? line.amount : -line.amount
    }
  }
  return balance as Cents
}
