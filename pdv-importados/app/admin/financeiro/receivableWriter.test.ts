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
    const rpc = vi.fn(async () => ({
      data: [{ liquidacao_id: 'l1', idempotent_replay: false, caixa_id: null }],
      error: null,
    }))
    const svc = createReceivableLiquidationService({ rpc } as never)
    await expect(
      svc.liquidate({
        tituloId: 't1',
        valor: 5,
        formaPagamento: 'PIX',
        idempotencyKey: 'key-1',
      }),
    ).resolves.toEqual({ ok: true, liquidacaoId: 'l1', idempotentReplay: false, caixaId: null })
    expect(rpc).toHaveBeenCalledWith(
      'registrar_liquidacao_receber',
      expect.objectContaining({
        p_titulo_id: 't1', p_valor: 5, p_idempotency_key: 'key-1', p_caixa_id: null,
      }),
    )
  })

  it('reverse chama RPC estornar_liquidacao_receber', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ estorno_id: 'e1', idempotent_replay: false }],
      error: null,
    }))
    const svc = createReceivableLiquidationService({ rpc } as never)
    await expect(
      svc.reverse({ liquidacaoId: 'l1', motivo: 'lançamento duplicado', idempotencyKey: 'key-estorno-1' }),
    ).resolves.toEqual({ ok: true, estornoId: 'e1', idempotentReplay: false })
    expect(rpc).toHaveBeenCalledWith(
      'estornar_liquidacao_receber',
      expect.objectContaining({
        p_liquidacao_id: 'l1',
        p_motivo: 'lançamento duplicado',
        p_idempotency_key: 'key-estorno-1',
      }),
    )
  })

  it('reverse propaga erro do RPC (ex.: já estornada)', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'ESTORNO_AR_JA_EXISTE' } }))
    const svc = createReceivableLiquidationService({ rpc } as never)
    await expect(
      svc.reverse({ liquidacaoId: 'l1', motivo: 'x', idempotencyKey: 'key-2' }),
    ).resolves.toMatchObject({ ok: false, error: 'ESTORNO_AR_JA_EXISTE' })
  })
})
