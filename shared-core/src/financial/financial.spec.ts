import { describe, expect, it } from 'vitest'
import type {
  ReceivableWriter,
  ReceivableLiquidationService,
  PayablePaymentService,
  PayableReader,
  ReceivableReader,
} from './index'
import { validateCreateReceivableInput } from './index'

describe('financial — contracts', () => {
  it('ReceivableWriter tipa create', async () => {
    const writer: ReceivableWriter = {
      async create() {
        return { ok: true, tituloId: 't1' }
      },
    }
    await expect(writer.create({ clienteId: 'c1', valorTotal: 10 })).resolves.toEqual({
      ok: true,
      tituloId: 't1',
    })
  })

  it('ReceivableLiquidationService tipa liquidate', async () => {
    const svc: ReceivableLiquidationService = {
      async liquidate() {
        return { ok: true, liquidacaoId: 'l1', idempotentReplay: false }
      },
    }
    expect(svc.liquidate).toBeTypeOf('function')
  })

  it('PayablePaymentService tipa pay/cancel', () => {
    const svc: PayablePaymentService = {
      async pay() {
        return { ok: true }
      },
      async cancel() {
        return { ok: true }
      },
    }
    expect(Object.keys(svc).sort()).toEqual(['cancel', 'pay'])
    expect(svc.cancel).toBeTypeOf('function')
  })

  it('policy espelha validação legada', () => {
    expect(validateCreateReceivableInput({ clienteId: 'c1', valorTotal: 1 }).ok).toBe(true)
  })

  it('PayableReader e ReceivableReader tipam list', () => {
    const payables: PayableReader = {
      async list() {
        return { ok: true, contas: [], hasMore: false }
      },
    }
    const receivables: ReceivableReader = {
      async list() {
        return { ok: true, titulos: [], capped: false }
      },
    }
    expect(payables.list).toBeTypeOf('function')
    expect(receivables.list).toBeTypeOf('function')
  })
})
