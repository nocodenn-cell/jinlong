import { describe, expect, it, vi } from 'vitest'
import {
  executarRecebimentoOrdemCompra,
  toItensConferenciaOc,
  validarItensRecebimentoOc,
} from './receberOrdemCompraContrato'

const OC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ITEM_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ITEM_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const itensOk = [
  { item_id: ITEM_A, quantidade_recebida: 10 },
  { item_id: ITEM_B, quantidade_recebida: 0 },
]

describe('toItensConferenciaOc', () => {
  it('mapeia quantidade_recebida da UI para quantidade_conferida do RPC', () => {
    expect(toItensConferenciaOc(itensOk)).toEqual([
      { item_id: ITEM_A, quantidade_conferida: 10 },
      { item_id: ITEM_B, quantidade_conferida: 0 },
    ])
  })
})

describe('validarItensRecebimentoOc', () => {
  it('rejeita lista vazia, NaN e quantidade negativa', () => {
    expect(validarItensRecebimentoOc([])).toMatch(/ao menos um item/)
    expect(validarItensRecebimentoOc([{ item_id: ITEM_A, quantidade_recebida: Number.NaN }])).toMatch(
      /inválida/,
    )
    expect(validarItensRecebimentoOc([{ item_id: ITEM_A, quantidade_recebida: -1 }])).toMatch(
      /inválida/,
    )
  })

  it('aceita conferência parcial com zero', () => {
    expect(validarItensRecebimentoOc(itensOk)).toBeNull()
  })
})

describe('executarRecebimentoOrdemCompra', () => {
  it('grava conferência e recebe só com p_oc_id (contrato migration 295)', async () => {
    const rpc = vi.fn(async () => ({ error: null }))
    await expect(executarRecebimentoOrdemCompra(rpc, OC_ID, itensOk)).resolves.toEqual({ ok: true })

    expect(rpc).toHaveBeenNthCalledWith(1, 'registrar_conferencia_ordem_compra', {
      p_oc_id: OC_ID,
      p_itens: [
        { item_id: ITEM_A, quantidade_conferida: 10 },
        { item_id: ITEM_B, quantidade_conferida: 0 },
      ],
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'receber_ordem_compra', { p_oc_id: OC_ID })
    expect(rpc.mock.calls[1]?.[1]).not.toHaveProperty('p_itens')
  })

  it('não chama receber_ordem_compra se a conferência falhar', async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'registrar_conferencia_ordem_compra') {
        return { error: { message: 'OC_STATUS_INVALIDO' } }
      }
      return { error: null }
    })

    await expect(executarRecebimentoOrdemCompra(rpc, OC_ID, itensOk)).resolves.toEqual({
      ok: false,
      etapa: 'conferencia',
      error: 'OC_STATUS_INVALIDO',
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).not.toHaveBeenCalledWith('receber_ordem_compra', expect.anything())
  })

  it('não dispara RPC quando a validação falha', async () => {
    const rpc = vi.fn(async () => ({ error: null }))
    await expect(executarRecebimentoOrdemCompra(rpc, OC_ID, [])).resolves.toMatchObject({
      ok: false,
      etapa: 'validacao',
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})
