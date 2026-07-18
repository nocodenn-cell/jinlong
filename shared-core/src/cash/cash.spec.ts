import { describe, expect, it } from 'vitest'
import type { CashSessionReader, CashSessionWriter, CashMovementWriter } from './index'
import { CASH_ERROR_CODES, validateCashMoneyValue } from './index'

describe('cash — contracts', () => {
  it('CashSessionReader tipa status', async () => {
    const reader: CashSessionReader = {
      async getStatus() {
        return { ok: true, status: 'FECHADO' }
      },
    }
    await expect(reader.getStatus('op1')).resolves.toMatchObject({ status: 'FECHADO' })
  })

  it('CashSessionWriter tipa open/close', async () => {
    const writer: CashSessionWriter = {
      async open() {
        return { ok: true, caixaId: 'c1' }
      },
      async close() {
        return {
          ok: true,
          caixaId: 'c1',
          valorSistemaDinheiro: 0,
          valorContado: 0,
          diferenca: 0,
          alreadyClosed: false,
        }
      },
    }
    expect(Object.keys(writer).sort()).toEqual(['close', 'open'])
  })

  it('CashMovementWriter tipa register', async () => {
    const writer: CashMovementWriter = {
      async register() {
        return { ok: false, error: 'x', code: CASH_ERROR_CODES.MOVEMENT_FAILED }
      },
    }
    expect(writer.register).toBeTypeOf('function')
  })

  it('policy pura sem I/O', () => {
    expect(validateCashMoneyValue(10).ok).toBe(true)
  })
})
