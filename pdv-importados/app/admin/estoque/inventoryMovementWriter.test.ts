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
        },
        adjustment: { adjustInventory: vi.fn() },
      },
    )

    await expect(
      writer.confirmRemessaEntrada({ remessaId: 'rem-1' }),
    ).resolves.toEqual({ ok: true, remessaId: 'rem-1' })
    expect(confirmRemessa).toHaveBeenCalledWith({ p_remessa_id: 'rem-1' })
  })

  // FLX-04: receber_ordem_compra não pode mais creditar estoque sem conferência
  // prévia gravada no servidor. O writer precisa registrar a conferência ANTES
  // de chamar o recebimento — e nunca chamar o recebimento se a conferência falhar.
  describe('receiveOrdemCompra (FLX-04)', () => {
    it('registra conferência antes de receber, na ordem certa', async () => {
      const chamadas: string[] = []
      const conferirOc = vi.fn(async () => {
        chamadas.push('conferir')
        return { data: { ok: true }, error: null }
      })
      const receiveOc = vi.fn(async () => {
        chamadas.push('receber')
        return { error: null }
      })
      const writer = createInventoryMovementWriter(
        { rpc: vi.fn() } as never,
        'l1',
        {
          rpc: {
            transfer: vi.fn(),
            confirmRemessa: vi.fn(),
            importNfe: vi.fn(),
            conferirOc,
            receiveOc,
          },
          adjustment: { adjustInventory: vi.fn() },
        },
      )

      await expect(
        writer.receiveOrdemCompra({
          ocId: 'oc-1',
          itens: [{ itemId: 'item-1', quantidadeRecebida: 8 }],
        }),
      ).resolves.toEqual({ ok: true, ocId: 'oc-1' })

      expect(chamadas).toEqual(['conferir', 'receber'])
      // A quantidade que o operador informa vira quantidade CONFERIDA, não um
      // parâmetro de recebimento direto — é isso que fecha FLX-04.
      expect(conferirOc).toHaveBeenCalledWith({
        p_oc_id: 'oc-1',
        p_itens: [{ item_id: 'item-1', quantidade_conferida: 8 }],
      })
      // receber_ordem_compra não aceita mais quantidade do cliente — só o id da OC.
      expect(receiveOc).toHaveBeenCalledWith({ p_oc_id: 'oc-1' })
    })

    it('não chama receber_ordem_compra se a conferência falhar', async () => {
      const conferirOc = vi.fn(async () => ({
        data: null,
        error: { message: 'OC_CONFERENCIA_QTD_INVALIDA' },
      }))
      const receiveOc = vi.fn(async () => ({ error: null }))
      const writer = createInventoryMovementWriter(
        { rpc: vi.fn() } as never,
        'l1',
        {
          rpc: {
            transfer: vi.fn(),
            confirmRemessa: vi.fn(),
            importNfe: vi.fn(),
            conferirOc,
            receiveOc,
          },
          adjustment: { adjustInventory: vi.fn() },
        },
      )

      const result = await writer.receiveOrdemCompra({
        ocId: 'oc-1',
        itens: [{ itemId: 'item-1', quantidadeRecebida: 5 }],
      })

      expect(conferirOc).toHaveBeenCalled()
      expect(result.ok).toBe(false)
      expect(receiveOc).not.toHaveBeenCalled()
    })
  })

  // FLX-05: importar_nfe_transacao deixou de creditar estoque/gerar contas_pagar
  // na mesma chamada — registra para conferência. registrarConferenciaNfe e
  // confirmarImportacaoNfe são portas separadas (como remessa), não encadeadas
  // automaticamente pelo writer — a action decide a ordem.
  describe('importNfe (FLX-05)', () => {
    it('expõe importacaoId a partir do retorno da RPC', async () => {
      const importNfe = vi.fn(async () => ({
        data: {
          ok: true,
          importacao_id: 'imp-1',
          itens_processados: 2,
          produtos_novos: 1,
          produtos_vinculados: 1,
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
          },
          adjustment: { adjustInventory: vi.fn() },
        },
      )

      await expect(
        writer.importNfe({
          chaveAcesso: '3'.repeat(44),
          numeroNf: '1',
          fornecedorCnpj: '11222333000181',
          fornecedorNome: 'Fornecedor',
          lojaId: 'l1',
          itens: [],
          atualizarCusto: true,
        }),
      ).resolves.toMatchObject({
        ok: true,
        importacaoId: 'imp-1',
        itensProcessados: 2,
        produtosNovos: 1,
        produtosVinculados: 1,
      })
    })
  })

  describe('registrarConferenciaNfe / confirmarImportacaoNfe (FLX-05)', () => {
    it('registrarConferenciaNfe delega à RPC com os itens conferidos', async () => {
      const conferirNfe = vi.fn(async () => ({
        data: { ok: true, importacao_id: 'imp-1', itens_conferidos: 1, itens_divergentes: 1 },
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
            conferirNfe,
            confirmarNfe: vi.fn(),
          },
          adjustment: { adjustInventory: vi.fn() },
        },
      )

      await expect(
        writer.registrarConferenciaNfe({
          importacaoId: 'imp-1',
          itens: [
            { itemId: 'item-a', quantidadeConferida: 7, divergenciaObs: 'faltou' },
            { itemId: 'item-b', quantidadeConferida: 20 },
          ],
        }),
      ).resolves.toEqual({
        ok: true,
        importacaoId: 'imp-1',
        itensConferidos: 1,
        itensDivergentes: 1,
      })

      expect(conferirNfe).toHaveBeenCalledWith({
        p_importacao_id: 'imp-1',
        p_itens: [
          { item_id: 'item-a', quantidade_conferida: 7, divergencia_obs: 'faltou' },
          { item_id: 'item-b', quantidade_conferida: 20, divergencia_obs: null },
        ],
      })
    })

    it('confirmarImportacaoNfe delega à RPC só com o id da importação', async () => {
      const confirmarNfe = vi.fn(async () => ({ error: null }))
      const writer = createInventoryMovementWriter(
        { rpc: vi.fn() } as never,
        'l1',
        {
          rpc: {
            transfer: vi.fn(),
            confirmRemessa: vi.fn(),
            importNfe: vi.fn(),
            conferirNfe: vi.fn(),
            confirmarNfe,
          },
          adjustment: { adjustInventory: vi.fn() },
        },
      )

      await expect(
        writer.confirmarImportacaoNfe({ importacaoId: 'imp-1' }),
      ).resolves.toEqual({ ok: true, importacaoId: 'imp-1' })
      expect(confirmarNfe).toHaveBeenCalledWith({ p_importacao_id: 'imp-1' })
    })

    it('confirmarImportacaoNfe propaga falha da RPC (ex.: conferência pendente)', async () => {
      const confirmarNfe = vi.fn(async () => ({
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
            conferirNfe: vi.fn(),
            confirmarNfe,
          },
          adjustment: { adjustInventory: vi.fn() },
        },
      )

      const result = await writer.confirmarImportacaoNfe({ importacaoId: 'imp-1' })
      expect(result.ok).toBe(false)
    })

    it('registrarConferenciaNfe rejeita lista vazia sem chamar a RPC', async () => {
      const conferirNfe = vi.fn()
      const writer = createInventoryMovementWriter(
        { rpc: vi.fn() } as never,
        'l1',
        {
          rpc: {
            transfer: vi.fn(),
            confirmRemessa: vi.fn(),
            importNfe: vi.fn(),
            conferirNfe,
            confirmarNfe: vi.fn(),
          },
          adjustment: { adjustInventory: vi.fn() },
        },
      )

      const result = await writer.registrarConferenciaNfe({ importacaoId: 'imp-1', itens: [] })
      expect(result.ok).toBe(false)
      expect(conferirNfe).not.toHaveBeenCalled()
    })
  })
})
