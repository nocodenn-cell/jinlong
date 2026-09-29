/**
 * Adapter InventoryAdjustmentService — ajuste manual.
 * Autoridade: RPC `ajustar_estoque_manual`. Policy no shared-core.
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
  p_observacao?: string
  p_ator_id: string
}) => Promise<{ error: { message: string } | null }>

export type InventoryAdjustmentDeps = {
  adjustRpc: AdjustEstoqueRpcFn
  reader: InventoryReader
}

function defaultDeps(supabase: SupabaseClient, lojaId: string): InventoryAdjustmentDeps {
  return {
    adjustRpc: async (args) => {
      const { error } = await supabase.rpc('ajustar_estoque_manual', args)
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
        // `ajustar_estoque_manual` SEMPRE grava `estoque_minimo = p_estoque_minimo`.
        // Comando sem mínimo não pode virar `0` por omissão (zeraria o mínimo em
        // silêncio a cada ajuste de saldo): preserva o valor atual da linha.
        // Linha inexistente (produto legado) não tem mínimo a preservar → 0, e a
        // RPC vai responder "linha não encontrada" de qualquer forma.
        let estoqueMinimo = cmd.estoqueMinimo
        if (estoqueMinimo === undefined) {
          const atual = await resolved.reader.getBalance(cmd.productId)
          if (atual.ok) {
            estoqueMinimo = atual.item.minimum
          } else if (atual.notFound) {
            estoqueMinimo = 0
          } else {
            return {
              ok: false,
              error: resolveInventoryMessage('pt-BR', INVENTORY_ERROR_CODES.READ_FAILED),
              code: INVENTORY_ERROR_CODES.READ_FAILED,
            }
          }
        }

        const { error } = await resolved.adjustRpc({
          p_produto_id: cmd.productId,
          p_loja_id: cmd.lojaId,
          p_quantidade_atual: cmd.quantity,
          p_estoque_minimo: estoqueMinimo,
          p_motivo_codigo: cmd.reason,
          p_observacao: cmd.observacao ?? undefined,
          p_ator_id: cmd.atorId,
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
