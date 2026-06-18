import { describe, it, expect } from 'vitest'
import { validateEntry } from '../validateEntry'
import { CASH, SALES_REVENUE } from '../chartOfAccounts'
import { toCents } from '../money'
import type { JournalEntry } from '../types'

function makeEntry(overrides?: Partial<JournalEntry>): JournalEntry {
  const amount = toCents(100)
  return {
    id: 'test-1',
    createdAt: new Date(),
    description: 'Teste',
    lines: [
      { account: CASH, direction: 'DEBIT', amount },
      { account: SALES_REVENUE, direction: 'CREDIT', amount },
    ],
    ...overrides,
  }
}

describe('validateEntry', () => {
  it('aceita entrada balanceada (débito = crédito)', () => {
    const result = validateEntry(makeEntry())
    expect(result.ok).toBe(true)
  })

  it('rejeita entrada vazia', () => {
    const result = validateEntry(makeEntry({ lines: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errorCode).toBe('VALIDATION_FAILED')
  })

  it('rejeita quando débito ≠ crédito', () => {
    const amount = toCents(100)
    const entry = makeEntry({
      lines: [
        { account: CASH, direction: 'DEBIT', amount: toCents(150) },
        { account: SALES_REVENUE, direction: 'CREDIT', amount },
      ],
    })
    const result = validateEntry(entry)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/UNBALANCED_JOURNAL_ENTRY/)
    }
  })

  it('rejeita linha com amount zero', () => {
    const entry = makeEntry({
      lines: [
        { account: CASH, direction: 'DEBIT', amount: 0 as ReturnType<typeof toCents> },
        { account: SALES_REVENUE, direction: 'CREDIT', amount: 0 as ReturnType<typeof toCents> },
      ],
    })
    const result = validateEntry(entry)
    expect(result.ok).toBe(false)
  })

  it('rejeita linha com amount negativo', () => {
    const entry = makeEntry({
      lines: [
        { account: CASH, direction: 'DEBIT', amount: -100 as ReturnType<typeof toCents> },
        { account: SALES_REVENUE, direction: 'CREDIT', amount: -100 as ReturnType<typeof toCents> },
      ],
    })
    const result = validateEntry(entry)
    expect(result.ok).toBe(false)
  })
})
