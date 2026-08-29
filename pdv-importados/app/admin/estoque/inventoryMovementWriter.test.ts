import { describe, expect, it, vi } from 'vitest'
import { INVENTORY_ERROR_CODES } from '@shared-core/src/inventory'
import { createInventoryMovementWriter } from './inventoryMovementWriter'

describe('createInventoryMovementWriter', () => {
  it('transfer rejeita mesma loja sem RPC', async () => {
    const transfer = vi.fn()
    const writer = createInventoryMovementWriter(
      { rpc: vi.fn() } as never,
      'l1',
      {
        rpc: {
          transfer,
          confirmRemessa: vi.fn(),
          importNfe: vi.fn(),
          registrarConferenciaNfe: vi.fn(),
          confirmarImportacaoNfe: vi.fn(),
        },
        adjustment: { adjustInventory: vi.fn() },
      },
    )

    const result = await writer.transfer({
      lojaOrigemId: 'a',
      lojaDestinoId: 'a',
      productId: 'p1',
      quantity: 1,
      idempotencyKey: 'k1',
      saldoEsperado: 1,
    })

    expect(result).toMatchObject({
      ok: false,
      code: INVENTORY_ERROR_CODES.TRANSFER_SAME_STORE,
    })
    expect(transfer).not.toHaveBeenCalled()
  })

  it('transfer delega à RPC transferir_estoque_seguro', async () => {
    const transfer = vi.fn(async () => ({ data: 'transf-1', error: null }))
    const writer = createInventoryMovementWriter(
      { rpc: vi.fn() } as never,
      'l1',
      {
        rpc: {
          transfer,
          confirmRemessa: vi.fn(),
          importNfe: vi.fn(),
          registrarConferenciaNfe: vi.fn(),
          confirmarImportacaoNfe: vi.fn(),
        },
        adjustment: { adjustInventory: vi.fn() },
      },
    )

    await expect(
      writer.transfer({
        lojaOrigemId: 'origem',
        lojaDestinoId: 'destino',
        productId: 'p1',
        quantity: 2,
        idempotencyKey: 'idem-1',
        saldoEsperado: 5,
      }),
    ).resolves.toEqual({ ok: true, transferenciaId: 'transf-1' })

    expect(transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        p_loja_origem: 'origem',
        p_loja_destino: 'destino',
        p_quantidade: 2,
        p_idempotency_key: 'idem-1',
      }),
    )
  })

  it('confirmRemessaEntrada delega à RPC', async () => {
    const confirmRemessa = vi.fn(async () => ({ error: null }))
    const writer = createInventoryMovementWriter(
      { rpc: vi.fn() } as never,
      'l1',
      {
        rpc: {
          transfer: vi.fn(),
          confirmRemessa,
          importNfe: vi.fn(),
          registrarConferenciaNfe: vi.fn(),
          confirmarImportacaoNfe: vi.fn(),
        },
        adjustment: { adjustInventory: vi.fn() },
      },
    )

    await expect(
      writer.confirmRemessaEntrada({ remessaId: 'rem-1' }),
    ).resolves.toEqual({ ok: true, remessaId: 'rem-1' })
    expect(confirmRemessa).toHaveBeenCalledWith({ p_remessa_id: 'rem-1' })
  })

  it('importNfe repassa importacao_id do retorno da RPC (FLX-05)', async () => {
    const importNfe = vi.fn(async () => ({
      data: {
        importacao_id: 'imp-1',
        itens_processados: 3,
        produtos_novos: 1,
        produtos_vinculados: 2,
      },
      error: null,
    }))
    const writer = createInventoryMovementWriter(
      { rpc: vi.fn() } as never,
      'l1',
      {
        rpc: {
          transfer: vi.fn(),
          confirmRemessa: vi.fn(),
          importNfe,
          registrarConferenciaNfe: vi.fn(),
          confirmarImportacaoNfe: vi.fn(),
        },
        adjustment: { adjustInventory: vi.fn() },
      },
    )

    await expect(
      writer.importNfe({
        chaveAcesso: '1'.repeat(44),
        numeroNf: '123',
        fornecedorCnpj: '12345678901234',
        fornecedorNome: 'Fornecedor Teste',
        lojaId: 'l1',
        itens: [],
        atualizarCusto: true,
      }),
    ).resolves.toMatchObject({
      ok: true,
      importacaoId: 'imp-1',
      itensProcessados: 3,
      produtosNovos: 1,
      produtosVinculados: 2,
    })
  })

  it('registrarConferenciaNfe delega à RPC registrar_conferencia_nfe', async () => {
    const registrarConferenciaNfe = vi.fn(async () => ({
      data: { itens_conferidos: 1, itens_divergentes: 1 },
      error: null,
    }))
    const writer = createInventoryMovementWriter(
      { rpc: vi.fn() } as never,
      'l1',
      {
        rpc: {
          transfer: vi.fn(),
          confirmRemessa: vi.fn(),
          importNfe: vi.fn(),
          registrarConferenciaNfe,
          confirmarImportacaoNfe: vi.fn(),
        },
        adjustment: { adjustInventory: vi.fn() },
      },
    )

    await expect(
      writer.registrarConferenciaNfe({
        importacaoId: 'imp-1',
        itens: [
          { itemId: 'item-1', quantidadeConferida: 10 },
          { itemId: 'item-2', quantidadeConferida: 8, divergenciaObs: 'faltou caixa' },
        ],
      }),
    ).resolves.toEqual({
      ok: true,
      importacaoId: 'imp-1',
      itensConferidos: 1,
      itensDivergentes: 1,
    })

    expect(registrarConferenciaNfe).toHaveBeenCalledWith({
      p_importacao_id: 'imp-1',
      p_itens: [
        { item_id: 'item-1', quantidade_conferida: 10, divergencia_obs: null },
        { item_id: 'item-2', quantidade_conferida: 8, divergencia_obs: 'faltou caixa' },
      ],
    })
  })

  it('registrarConferenciaNfe rejeita payload vazio sem RPC', async () => {
    const registrarConferenciaNfe = vi.fn()
    const writer = createInventoryMovementWriter(
      { rpc: vi.fn() } as never,
      'l1',
      {
        rpc: {
          transfer: vi.fn(),
          confirmRemessa: vi.fn(),
          importNfe: vi.fn(),
          registrarConferenciaNfe,
          confirmarImportacaoNfe: vi.fn(),
        },
        adjustment: { adjustInventory: vi.fn() },
      },
    )

    const result = await writer.registrarConferenciaNfe({ importacaoId: 'imp-1', itens: [] })
    expect(result.ok).toBe(false)
    expect(registrarConferenciaNfe).not.toHaveBeenCalled()
  })

  it('confirmarImportacaoNfe delega à RPC confirmar_importacao_nfe', async () => {
    const confirmarImportacaoNfe = vi.fn(async () => ({ error: null }))
    const writer = createInventoryMovementWriter(
      { rpc: vi.fn() } as never,
      'l1',
      {
        rpc: {
          transfer: vi.fn(),
          confirmRemessa: vi.fn(),
          importNfe: vi.fn(),
          registrarConferenciaNfe: vi.fn(),
          confirmarImportacaoNfe,
        },
        adjustment: { adjustInventory: vi.fn() },
      },
    )

    await expect(
      writer.confirmarImportacaoNfe({ importacaoId: 'imp-1' }),
    ).resolves.toEqual({ ok: true, importacaoId: 'imp-1' })
    expect(confirmarImportacaoNfe).toHaveBeenCalledWith({ p_importacao_id: 'imp-1' })
  })

  it('confirmarImportacaoNfe propaga erro da RPC (ex.: conferência pendente)', async () => {
    const confirmarImportacaoNfe = vi.fn(async () => ({
      error: { message: 'IMPORT_NFE_CONFERENCIA_PENDENTE' },
    }))
    const writer = createInventoryMovementWriter(
      { rpc: vi.fn() } as never,
      'l1',
      {
        rpc: {
          transfer: vi.fn(),
          confirmRemessa: vi.fn(),
          importNfe: vi.fn(),
          registrarConferenciaNfe: vi.fn(),
          confirmarImportacaoNfe,
        },
        adjustment: { adjustInventory: vi.fn() },
      },
    )

    const result = await writer.confirmarImportacaoNfe({ importacaoId: 'imp-1' })
    expect(result).toMatchObject({ ok: false, error: 'IMPORT_NFE_CONFERENCIA_PENDENTE' })
  })
})
