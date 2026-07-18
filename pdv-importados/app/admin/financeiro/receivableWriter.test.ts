import { describe, expect, it, vi } from 'vitest'
import { FINANCIAL_ERROR_CODES } from '@shared-core/src/financial'
import {
  createReceivableLiquidationService,
  createReceivableWriter,
} from './receivableWriter'

describe('receivable adapters', () => {
  it('create rejeita cliente vazio sem INSERT', async () => {
    const from = vi.fn()
    const writer = createReceivableWriter({ from, rpc: vi.fn() } as never)
    const result = await writer.create({ clienteId: '', valorTotal: 10 })
    expect(result).toMatchObject({
      ok: false,
      code: FINANCIAL_ERROR_CODES.CLIENT_REQUIRED,
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('liquidate chama RPC registrar_liquidacao_receber', async () => {
    const rpc = vi.fn(async () => ({ error: null }))
    const svc = createReceivableLiquidationService({ rpc } as never)
    await expect(
      svc.liquidate({
        tituloId: 't1',
        valor: 5,
        formaPagamento: 'PIX',
      }),
    ).resolves.toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith(
      'registrar_liquidacao_receber',
      expect.objectContaining({ p_titulo_id: 't1', p_valor: 5 }),
    )
  })
})
