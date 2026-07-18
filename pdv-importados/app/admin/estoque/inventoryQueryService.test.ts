import { describe, expect, it, vi } from 'vitest'
import {
  createInventoryQueryService,
  mapStockListRpcRow,
} from './inventoryQueryService'

describe('inventoryQueryService', () => {
  it('mapStockListRpcRow preserva saldo e mínimo', () => {
    expect(
      mapStockListRpcRow({
        id: 'p1',
        nome: 'Item',
        codigo_barras: '123',
        unidade_medida: 'UN',
        origem: 'china_manual',
        categoria_id: null,
        estoque_id: 'e1',
        quantidade_atual: 3,
        estoque_minimo: 1,
        deficit: 0,
      }),
    ).toEqual({
      productId: 'p1',
      nome: 'Item',
      codigoBarras: '123',
      unidadeMedida: 'UN',
      origem: 'china_manual',
      categoriaId: null,
      estoqueId: 'e1',
      quantity: 3,
      minimum: 1,
      deficit: 0,
    })
  })

  it('listStockPage chama RPC gerente_estoque_list_page', async () => {
    const rpc = vi.fn(async () => ({
      data: { total: 1, rows: [{ id: 'p1', nome: 'A', quantidade_atual: 2, estoque_minimo: 0 }] },
      error: null,
    }))
    const svc = createInventoryQueryService({ rpc } as never)

    const result = await svc.listStockPage({
      lojaId: 'l1',
      visao: 'geral',
      limite: 25,
      offset: 0,
    })

    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith(
      'gerente_estoque_list_page',
      expect.objectContaining({ p_loja_id: 'l1', p_visao: 'geral' }),
    )
  })
})
