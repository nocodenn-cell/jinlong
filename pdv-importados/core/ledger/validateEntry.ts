import type { JournalEntry } from './types'
import { actionOk, actionFail } from '@shared-core/src/result/actionResult'
import type { ActionResult } from '@shared-core/src/result/actionResult'

/**
 * Valida um lançamento antes de aceitar no razão.
 * Regras:
 *   1. Deve ter ao menos uma linha.
 *   2. Nenhuma linha com amount ≤ 0.
 *   3. Sum(DEBIT) === Sum(CREDIT) — partida dobrada obrigatória (hard stop).
 */
export function validateEntry(entry: JournalEntry): ActionResult<JournalEntry> {
  if (entry.lines.length === 0) {
    return actionFail('Lançamento vazio — deve ter ao menos uma linha.', {
      errorCode: 'VALIDATION_FAILED',
    })
  }

  for (const line of entry.lines) {
    if (line.amount <= 0) {
      return actionFail(
        `Linha inválida na conta ${line.account.id}: amount deve ser positivo (em centavos).`,
        { errorCode: 'VALIDATION_FAILED' },
      )
    }
  }

  const totalDebit = entry.lines
    .filter(l => l.direction === 'DEBIT')
    .reduce((s, l) => s + l.amount, 0)

  const totalCredit = entry.lines
    .filter(l => l.direction === 'CREDIT')
    .reduce((s, l) => s + l.amount, 0)

  if (totalDebit !== totalCredit) {
    return actionFail(
      `UNBALANCED_JOURNAL_ENTRY: débito ${totalDebit}¢ ≠ crédito ${totalCredit}¢`,
      { errorCode: 'VALIDATION_FAILED' },
    )
  }

  return actionOk(entry)
}
