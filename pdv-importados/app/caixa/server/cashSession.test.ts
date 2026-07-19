import { describe, expect, it, vi } from 'vitest'
import { CASH_ERROR_CODES } from '@shared-core/src/cash'
import { createCashSessionWriter } from './cashSession'

describe('createCashSessionWriter', () => {
  it('rejeita valor inicial inválido sem INSERT', async () => {
    const from = vi.fn()
    const writer = createCashSessionWriter({
      from,
      rpc: vi.fn(),
    } as never)

    const result = await writer.open({
      operadorId: 'op1',
      lojaId: 'l1',
      valorInicial: Number.NaN,
    })

    expect(result).toMatchObject({
      ok: false,
      code: CASH_ERROR_CODES.VALUE_INVALID,
    })
    expect(from).not.toHaveBeenCalled()
  })
})
