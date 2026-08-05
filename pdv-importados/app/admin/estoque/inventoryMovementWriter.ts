/**
 * Adapter InventoryMovementWriter — superfície canônica inventory-led.
 * Delegação exclusiva às RPCs existentes. Sem UPDATE/INSERT de saldo na app.
 *
 * Sales-led (venda/cancel/devolução) não passa por aqui (ADR-008).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ConfirmarImportacaoNfeCommand,
  ConfirmarImportacaoNfeResult,
  ConfirmRemessaCommand,
  ConfirmRemessaResult,
  ImportNfeCommand,
  ImportNfeResult,
  InventoryAdjustmentService,
  InventoryMovementWriter,
  ReceiveOrdemCompraCommand,
  ReceiveOrdemCompraResult,
  RegistrarConferenciaNfeCommand,
  RegistrarConferenciaNfeResult,
  RegistrarConferenciaRemessaCommand,
  RegistrarConferenciaRemessaResult,
  RegisterMovementCommand,
  RegisterMovementResult,
  TransferStockCommand,
  TransferStockResult,
} from '@shared-core/src/inventory'
import { INVENTORY_ERROR_CODES } from '@shared-core/src/inventory'
import { createInventoryAdjustmentService } from '@/app/admin/estoque/inventoryAdjustment'
import { resolveInventoryMessage } from '@/app/admin/estoque/inventoryMessages'

export type MovementWriterRpc = {
  transfer: (args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  confirmRemessa: (args: { p_remessa_id: string }) => Promise<{ error: { message: string } | null }>
  importNfe: (args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  receiveOc: (args: { p_oc_id: string }) => Promise<{ error: { message: string } | null }>
  /** FLX-04: registra a contagem física por item de OC — pré-requisito de receiveOc. */
  conferirOc: (
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>
  registrarConferencia: (
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>
  /** FLX-05: registra a contagem física por item de importação de NF-e. */
  conferirNfe: (
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>
  /** FLX-05: credita estoque/gera contas_pagar — só após conferência completa. */
  confirmarNfe: (args: { p_importacao_id: string }) => Promise<{ error: { message: string } | null }>
}

export type InventoryMovementWriterDeps = {
  rpc: MovementWriterRpc
  adjustment: InventoryAdjustmentService
}

function defaultRpc(supabase: SupabaseClient): MovementWriterRpc {
  return {
    transfer: async (args) => supabase.rpc('transferir_estoque_seguro', args),
    confirmRemessa: async (args) => {
      const { error } = await supabase.rpc('confirmar_remessa_entrada', args)
      return { error }
    },
    importNfe: async (args) => supabase.rpc('importar_nfe_transacao', args),
    registrarConferencia: async (args) =>
      supabase.rpc('registrar_conferencia_remessa', args),
    conferirOc: async (args) => supabase.rpc('registrar_conferencia_ordem_compra', args),
    receiveOc: async (args) => {
      const { error } = await supabase.rpc('receber_ordem_compra', args)
      return { error }
    },
    conferirNfe: async (args) => supabase.rpc('registrar_conferencia_nfe', args),
    confirmarNfe: async (args) => {
      const { error } = await supabase.rpc('confirmar_importacao_nfe', args)
      return { error }
    },
  }
}

export function createInventoryMovementWriter(
  supabase: SupabaseClient,
  lojaId: string,
  deps?: Partial<InventoryMovementWriterDeps>,
): InventoryMovementWriter {
  const adjustment =
    deps?.adjustment ?? createInventoryAdjustmentService(supabase, lojaId)
  const rpc = deps?.rpc ?? defaultRpc(supabase)

  return {
    async registerMovement(
      command: RegisterMovementCommand,
    ): Promise<RegisterMovementResult> {
      /**
       * Ajuste tipado: `quantity` = alvo absoluto (`quantidade_atual`), não delta.
       * Preferir `InventoryAdjustmentService.adjustInventory` nos callers.
       * Tipos sales-led / transferência / NF-e: usar métodos tipados abaixo.
       */
      const reason = command.reason?.trim()
      if (!reason) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.REASON_INVALID),
          code: INVENTORY_ERROR_CODES.REASON_INVALID,
        }
      }
      const adjusted = await adjustment.adjustInventory({
        productId: command.productId,
        lojaId: command.lojaId,
        quantity: command.quantity,
        reason,
        observacao: null,
        atorId: command.atorId,
      })
      if (!adjusted.ok) {
        return { ok: false, error: adjusted.error, code: adjusted.code }
      }
      return {
        ok: true,
        movement: {
          movementId: 'pending-reload',
          productId: command.productId,
          type: command.type,
          quantity: command.quantity,
          reason,
          createdAt: new Date().toISOString(),
        },
      }
    },

    async transfer(command: TransferStockCommand): Promise<TransferStockResult> {
      if (command.lojaOrigemId === command.lojaDestinoId) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.TRANSFER_SAME_STORE),
          code: INVENTORY_ERROR_CODES.TRANSFER_SAME_STORE,
        }
      }
      if (!Number.isFinite(command.quantity) || command.quantity <= 0) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.QTY_INVALID),
          code: INVENTORY_ERROR_CODES.QTY_INVALID,
        }
      }
      if (!command.idempotencyKey?.trim()) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.TRANSFER_KEY_REQUIRED),
          code: INVENTORY_ERROR_CODES.TRANSFER_KEY_REQUIRED,
        }
      }
      try {
        const { data, error } = await rpc.transfer({
          p_loja_origem: command.lojaOrigemId,
          p_loja_destino: command.lojaDestinoId,
          p_produto_id: command.productId,
          p_quantidade: command.quantity,
          p_observacao: command.observacao?.trim() || null,
          p_idempotency_key: command.idempotencyKey.trim(),
          p_saldo_esperado: command.saldoEsperado,
        })
        if (error) {
          return {
            ok: false,
            error: error.message,
            code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
          }
        }
        const transferenciaId = typeof data === 'string' ? data : null
        if (!transferenciaId) {
          return {
            ok: false,
            error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.MOVEMENT_FAILED),
            code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
          }
        }
        return { ok: true, transferenciaId }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha na transferência.',
          code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
        }
      }
    },

    async registrarConferenciaRemessa(
      command: RegistrarConferenciaRemessaCommand,
    ): Promise<RegistrarConferenciaRemessaResult> {
      if (!command.remessaId?.trim()) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.REMESSA_ID_REQUIRED),
          code: INVENTORY_ERROR_CODES.REMESSA_ID_REQUIRED,
        }
      }
      // `0` é contagem válida ("contei, não veio"); negativo e não-finito não são.
      const invalido = command.itens.some(
        (i) =>
          !i.produtoId?.trim() ||
          !Number.isFinite(i.quantidadeConferida) ||
          i.quantidadeConferida < 0,
      )
      if (command.itens.length === 0 || invalido) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.CONFERENCIA_QTD_INVALIDA),
          code: INVENTORY_ERROR_CODES.CONFERENCIA_QTD_INVALIDA,
        }
      }
      try {
        const { data, error } = await rpc.registrarConferencia({
          p_remessa_id: command.remessaId.trim(),
          p_itens: command.itens.map((i) => ({
            produto_id: i.produtoId.trim(),
            quantidade_conferida: i.quantidadeConferida,
          })),
          p_divergencia_motivo: command.divergenciaMotivo?.trim() || null,
        })
        if (error) {
          return {
            ok: false,
            error: error.message,
            code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
          }
        }
        const row = (Array.isArray(data) ? data[0] : data) as
          | { o_status?: unknown; o_itens_divergentes?: unknown }
          | null
        return {
          ok: true,
          remessaId: command.remessaId.trim(),
          status: String(row?.o_status ?? 'EM_CONFERENCIA'),
          itensDivergentes: Number(row?.o_itens_divergentes ?? 0),
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha ao registrar a conferência.',
          code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
        }
      }
    },

    async confirmRemessaEntrada(
      command: ConfirmRemessaCommand,
    ): Promise<ConfirmRemessaResult> {
      if (!command.remessaId?.trim()) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.REMESSA_ID_REQUIRED),
          code: INVENTORY_ERROR_CODES.REMESSA_ID_REQUIRED,
        }
      }
      try {
        const { error } = await rpc.confirmRemessa({ p_remessa_id: command.remessaId })
        if (error) {
          return {
            ok: false,
            error: error.message,
            code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
          }
        }
        return { ok: true, remessaId: command.remessaId }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha ao confirmar remessa.',
          code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
        }
      }
    },

    async receiveOrdemCompra(
      command: ReceiveOrdemCompraCommand,
    ): Promise<ReceiveOrdemCompraResult> {
      if (!command.ocId?.trim()) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.OC_ID_REQUIRED),
          code: INVENTORY_ERROR_CODES.OC_ID_REQUIRED,
        }
      }
      const itens = command.itens.filter(
        (i) => i.itemId?.trim() && Number.isFinite(i.quantidadeRecebida) && i.quantidadeRecebida > 0,
      )
      if (itens.length === 0) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.OC_ITENS_REQUIRED),
          code: INVENTORY_ERROR_CODES.OC_ITENS_REQUIRED,
        }
      }
      try {
        // FLX-04: recebimento agora exige conferência prévia gravada no servidor.
        // A quantidade que o operador digita aqui é a contagem física — grava-se
        // primeiro como conferência (com auditoria: conferido_por/conferido_em);
        // só então `receber_ordem_compra` credita, usando o valor conferido, não
        // este payload. Contrato externo (ReceiveOrdemCompraCommand) inalterado —
        // a mudança fica inteira dentro deste método.
        const { error: erroConferencia } = await rpc.conferirOc({
          p_oc_id: command.ocId.trim(),
          p_itens: itens.map((i) => ({
            item_id: i.itemId.trim(),
            quantidade_conferida: i.quantidadeRecebida,
          })),
        })
        if (erroConferencia) {
          return {
            ok: false,
            error: erroConferencia.message,
            code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
          }
        }

        const { error } = await rpc.receiveOc({ p_oc_id: command.ocId.trim() })
        if (error) {
          return {
            ok: false,
            error: error.message,
            code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
          }
        }
        return { ok: true, ocId: command.ocId.trim() }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha ao receber a ordem de compra.',
          code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
        }
      }
    },

    async importNfe(command: ImportNfeCommand): Promise<ImportNfeResult> {
      if (!command.chaveAcesso?.trim() || !command.lojaId?.trim()) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.NFE_PAYLOAD_INVALID),
          code: INVENTORY_ERROR_CODES.NFE_PAYLOAD_INVALID,
        }
      }
      try {
        const { data, error } = await rpc.importNfe({
          p_chave_acesso: command.chaveAcesso,
          p_numero_nf: command.numeroNf,
          p_fornecedor_cnpj: command.fornecedorCnpj,
          p_fornecedor_nome: command.fornecedorNome,
          p_loja_id: command.lojaId,
          p_itens: command.itens,
          p_atualizar_custo: command.atualizarCusto,
          p_duplicatas: command.duplicatas ?? null,
        })
        if (error) {
          return {
            ok: false,
            error: error.message,
            code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
          }
        }
        const row = data as {
          importacao_id?: string
          itens_processados?: number
          produtos_novos?: number
          produtos_vinculados?: number
        } | null
        return {
          ok: true,
          importacaoId: row?.importacao_id ?? '',
          itensProcessados: row?.itens_processados ?? 0,
          produtosNovos: row?.produtos_novos ?? 0,
          produtosVinculados: row?.produtos_vinculados ?? 0,
          raw: data,
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha na importação NF-e.',
          code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
        }
      }
    },

    async registrarConferenciaNfe(
      command: RegistrarConferenciaNfeCommand,
    ): Promise<RegistrarConferenciaNfeResult> {
      if (!command.importacaoId?.trim()) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.NFE_IMPORTACAO_ID_REQUIRED),
          code: INVENTORY_ERROR_CODES.NFE_IMPORTACAO_ID_REQUIRED,
        }
      }
      // `0` é contagem válida ("contei, não veio"); negativo e não-finito não são.
      const invalido = command.itens.some(
        (i) =>
          !i.itemId?.trim() ||
          !Number.isFinite(i.quantidadeConferida) ||
          i.quantidadeConferida < 0,
      )
      if (command.itens.length === 0 || invalido) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.CONFERENCIA_QTD_INVALIDA),
          code: INVENTORY_ERROR_CODES.CONFERENCIA_QTD_INVALIDA,
        }
      }
      try {
        const { data, error } = await rpc.conferirNfe({
          p_importacao_id: command.importacaoId.trim(),
          p_itens: command.itens.map((i) => ({
            item_id: i.itemId.trim(),
            quantidade_conferida: i.quantidadeConferida,
            divergencia_obs: i.divergenciaObs?.trim() || null,
          })),
        })
        if (error) {
          return {
            ok: false,
            error: error.message,
            code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
          }
        }
        const row = (Array.isArray(data) ? data[0] : data) as
          | { itens_conferidos?: unknown; itens_divergentes?: unknown }
          | null
        return {
          ok: true,
          importacaoId: command.importacaoId.trim(),
          itensConferidos: Number(row?.itens_conferidos ?? 0),
          itensDivergentes: Number(row?.itens_divergentes ?? 0),
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha ao registrar a conferência.',
          code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
        }
      }
    },

    async confirmarImportacaoNfe(
      command: ConfirmarImportacaoNfeCommand,
    ): Promise<ConfirmarImportacaoNfeResult> {
      if (!command.importacaoId?.trim()) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.NFE_IMPORTACAO_ID_REQUIRED),
          code: INVENTORY_ERROR_CODES.NFE_IMPORTACAO_ID_REQUIRED,
        }
      }
      try {
        const { error } = await rpc.confirmarNfe({ p_importacao_id: command.importacaoId.trim() })
        if (error) {
          return {
            ok: false,
            error: error.message,
            code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
          }
        }
        return { ok: true, importacaoId: command.importacaoId.trim() }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha ao confirmar a importação de NF-e.',
          code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
        }
      }
    },
  }
}
