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
  RegisterMovementCommand,
  RegisterMovementResult,
  RegistrarConferenciaNfeCommand,
  RegistrarConferenciaNfeResult,
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
  registrarConferenciaNfe: (
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>
  confirmarImportacaoNfe: (
    args: { p_importacao_id: string },
  ) => Promise<{ error: { message: string } | null }>
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
    registrarConferenciaNfe: async (args) => supabase.rpc('registrar_conferencia_nfe', args),
    confirmarImportacaoNfe: async (args) => {
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
          importacaoId: row?.importacao_id ?? null,
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
      if (!command.importacaoId?.trim() || command.itens.length === 0) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.NFE_PAYLOAD_INVALID),
          code: INVENTORY_ERROR_CODES.NFE_PAYLOAD_INVALID,
        }
      }
      try {
        const { data, error } = await rpc.registrarConferenciaNfe({
          p_importacao_id: command.importacaoId,
          p_itens: command.itens.map((item) => ({
            item_id: item.itemId,
            quantidade_conferida: item.quantidadeConferida,
            divergencia_obs: item.divergenciaObs ?? null,
          })),
        })
        if (error) {
          return { ok: false, error: error.message, code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED }
        }
        const row = data as { itens_conferidos?: number; itens_divergentes?: number } | null
        return {
          ok: true,
          importacaoId: command.importacaoId,
          itensConferidos: row?.itens_conferidos ?? 0,
          itensDivergentes: row?.itens_divergentes ?? 0,
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha ao registrar conferência da NF-e.',
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
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.NFE_PAYLOAD_INVALID),
          code: INVENTORY_ERROR_CODES.NFE_PAYLOAD_INVALID,
        }
      }
      try {
        const { error } = await rpc.confirmarImportacaoNfe({ p_importacao_id: command.importacaoId })
        if (error) {
          return { ok: false, error: error.message, code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED }
        }
        return { ok: true, importacaoId: command.importacaoId }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha ao confirmar importação da NF-e.',
          code: INVENTORY_ERROR_CODES.MOVEMENT_FAILED,
        }
      }
    },
  }
}
