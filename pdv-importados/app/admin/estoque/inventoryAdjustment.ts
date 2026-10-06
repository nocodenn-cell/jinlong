/**
 * Adapter InventoryAdjustmentService — ajuste manual.
 * Autoridade: RPC `ajustar_estoque_manual_seguro`. Policy no shared-core.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AdjustInventoryCommand,
  AdjustInventoryResult,
  InventoryAdjustmentService,
  InventoryReader,
} from '@shared-core/src/inventory'
import {
  INVENTORY_ERROR_CODES,
  mapAjusteRpcMessageToCode,
  validateAdjustInventoryCommand,
} from '@shared-core/src/inventory'
import { createInventoryReader } from '@/app/admin/estoque/inventoryReader'
import { resolveInventoryMessage } from '@/app/admin/estoque/inventoryMessages'

export type AdjustEstoqueRpcFn = (args: {
  p_produto_id: string
  p_loja_id: string
  p_quantidade_atual: number
  p_estoque_minimo: number
  p_motivo_codigo: string
  p_observacao: string | null
  p_ator_id: string
  p_quantidade_esperada: number | null
  p_minimo_esperado: number | null
}) => Promise<{ error: { message: string } | null }>

export type InventoryAdjustmentDeps = {
  adjustRpc: AdjustEstoqueRpcFn
  reader: InventoryReader
}

function defaultDeps(supabase: SupabaseClient, lojaId: string): InventoryAdjustmentDeps {
  return {
    adjustRpc: async (args) => {
      const { error } = await supabase.rpc('ajustar_estoque_manual_seguro', args)
      return { error }
    },
    reader: createInventoryReader(supabase, lojaId),
  }
}

export function createInventoryAdjustmentService(
  supabase: SupabaseClient,
  lojaId: string,
  deps?: Partial<InventoryAdjustmentDeps>,
): InventoryAdjustmentService {
  const resolved: InventoryAdjustmentDeps = {
    ...defaultDeps(supabase, lojaId),
    ...deps,
  }

  return {
    async adjustInventory(command: AdjustInventoryCommand): Promise<AdjustInventoryResult> {
      const validated = validateAdjustInventoryCommand(command)
      if (!validated.ok) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', validated.code),
          code: validated.code,
        }
      }
      const cmd = validated.command
      if (!cmd.atorId?.trim()) {
        return {
          ok: false,
          error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.AUTH_REQUIRED),
          code: INVENTORY_ERROR_CODES.AUTH_REQUIRED,
        }
      }

      try {
        const { error } = await resolved.adjustRpc({
          p_produto_id: cmd.productId,
          p_loja_id: cmd.lojaId,
          p_quantidade_atual: cmd.quantity,
          p_estoque_minimo: cmd.estoqueMinimo ?? 0,
          p_motivo_codigo: cmd.reason,
          p_observacao: cmd.observacao ?? null,
          p_ator_id: cmd.atorId,
          p_quantidade_esperada: cmd.expectedQuantity ?? null,
          p_minimo_esperado: cmd.expectedMinimum ?? null,
        })
        if (error) {
          const code = mapAjusteRpcMessageToCode(error.message)
          return {
            ok: false,
            error: resolveInventoryMessage('pt-BR', code),
            code,
            notFound: code === INVENTORY_ERROR_CODES.NOT_FOUND,
          }
        }

        const reload = await resolved.reader.getBalance(cmd.productId)
        if (!reload.ok) {
          return {
            ok: false,
            error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.READ_FAILED),
            code: INVENTORY_ERROR_CODES.READ_FAILED,
          }
        }
        return { ok: true, item: reload.item }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.ADJUST_FAILED),
          code: INVENTORY_ERROR_CODES.ADJUST_FAILED,
        }
      }
    },
  }
}
