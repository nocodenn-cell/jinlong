/**
 * Regressão: produto legado sem linha em `estoque` deixava o operador travado.
 *
 * A tela /admin/estoque lista (visão "geral", LEFT JOIN) produtos SEM linha em
 * `estoque` e oferece o botão "Ajustar". A RPC abortava com
 * AJUSTE_ESTOQUE_LINHA_NAO_ENCONTRADA e não havia, em nenhuma tela, como criar
 * a linha — o produto ficava sem saldo ajustável para sempre.
 */
import { describe, expect, it, vi } from 'vitest'
import { INVENTORY_ERROR_CODES, type AdjustInventoryCommand } from '@shared-core/src/inventory'
import { ajustarComLinhaGarantida } from './ajusteComLinhaGarantida'

const comando: AdjustInventoryCommand = {
  productId: 'prod-1',
  lojaId: 'loja-1',
  quantity: 12,
  estoqueMinimo: 2,
  reason: 'ACERTO_INVENTARIO',
  observacao: null,
  atorId: 'user-1',
}

const okResult = { ok: true } as const
const naoEncontrado = {
  ok: false as const,
  error: 'INVENTORY_NOT_FOUND',
  code: INVENTORY_ERROR_CODES.NOT_FOUND,
}

describe('ajustarComLinhaGarantida', () => {
  it('cria a linha faltante e repete o ajuste uma vez', async () => {
    const ajustar = vi
      .fn()
      .mockResolvedValueOnce(naoEncontrado)
      .mockResolvedValueOnce(okResult)
    const garantirLinha = vi.fn().mockResolvedValue(true)

    const r = await ajustarComLinhaGarantida(comando, { ajustar, garantirLinha })

    expect(r.ok).toBe(true)
    expect(garantirLinha).toHaveBeenCalledTimes(1)
    expect(ajustar).toHaveBeenCalledTimes(2)
  })

  it('não tenta criar linha quando o ajuste dá certo de primeira', async () => {
    const ajustar = vi.fn().mockResolvedValue(okResult)
    const garantirLinha = vi.fn()

    await ajustarComLinhaGarantida(comando, { ajustar, garantirLinha })

    expect(garantirLinha).not.toHaveBeenCalled()
    expect(ajustar).toHaveBeenCalledTimes(1)
  })

  it('não repete o ajuste em erro que não é linha ausente', async () => {
    const insuficiente = {
      ok: false as const,
      error: 'INVENTORY_INSUFFICIENT',
      code: INVENTORY_ERROR_CODES.INSUFFICIENT,
    }
    const ajustar = vi.fn().mockResolvedValue(insuficiente)
    const garantirLinha = vi.fn()

    const r = await ajustarComLinhaGarantida(comando, { ajustar, garantirLinha })

    expect(r).toEqual(insuficiente)
    expect(garantirLinha).not.toHaveBeenCalled()
    expect(ajustar).toHaveBeenCalledTimes(1)
  })

  it('devolve o erro original quando a linha não pôde ser criada', async () => {
    const ajustar = vi.fn().mockResolvedValue(naoEncontrado)
    const garantirLinha = vi.fn().mockResolvedValue(false)

    const r = await ajustarComLinhaGarantida(comando, { ajustar, garantirLinha })

    expect(r).toEqual(naoEncontrado)
    expect(ajustar).toHaveBeenCalledTimes(1)
  })
})
