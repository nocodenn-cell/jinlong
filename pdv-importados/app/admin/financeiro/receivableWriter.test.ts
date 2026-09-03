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
    const result = await writer.create({ clienteId: '', lojaId: 'loja-1', valorTotal: 10 })
    expect(result).toMatchObject({
      ok: false,
      code: FINANCIAL_ERROR_CODES.CLIENT_REQUIRED,
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('create envia loja_id no INSERT (contas_receber.loja_id é NOT NULL — migration 112)', async () => {
    const single = vi.fn(async () => ({ data: { id: 'titulo-1' }, error: null }))
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ insert }))
    const writer = createReceivableWriter({ from, rpc: vi.fn() } as never)

    const result = await writer.create({
      clienteId: 'c1',
      lojaId: 'loja-1',
      valorTotal: 10,
    })

    expect(result).toEqual({ ok: true, tituloId: 'titulo-1' })
    expect(from).toHaveBeenCalledWith('contas_receber')
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_id: 'c1', loja_id: 'loja-1', valor_total: 10 }),
    )
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
