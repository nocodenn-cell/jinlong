/**
 * Adapter InventoryMovementReader — kardex read-only.
 * SELECT `movimentos_estoque_log`; sem mutação.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  InventoryMovement,
  InventoryMovementReader,
  ListMovementsByProductQuery,
  ListMovementsByProductResult,
  LojaId,
} from '@shared-core/src/inventory'
import { INVENTORY_ERROR_CODES } from '@shared-core/src/inventory'

const KARDEX_COLS = 'id, created_at, tipo_codigo, quantidade_delta, observacao, produto_id'
const DEFAULT_LIMIT = 60

type KardexRow = {
  id: string
  created_at: string
  tipo_codigo: string
  quantidade_delta: number | string
  observacao: string | null
  produto_id: string
}

export function mapKardexRow(r: KardexRow): InventoryMovement {
  return {
    movementId: String(r.id),
    productId: String(r.produto_id),
    type: String(r.tipo_codigo ?? ''),
    quantity: Number(r.quantidade_delta ?? 0),
    reason: r.observacao == null ? null : String(r.observacao),
    createdAt: String(r.created_at),
  }
}

export function createInventoryMovementReader(
  supabase: SupabaseClient,
  lojaId: LojaId,
): InventoryMovementReader {
  return {
    async listByProduct(
      query: ListMovementsByProductQuery,
    ): Promise<ListMovementsByProductResult> {
      const limit = query.limit ?? DEFAULT_LIMIT
      try {
        const { data, error } = await supabase
          .from('movimentos_estoque_log')
          .select(KARDEX_COLS)
          .eq('produto_id', query.productId)
          .eq('loja_id', lojaId)
          .order('created_at', { ascending: false })
          .limit(limit)

        if (error) {
          return {
            ok: false,
            error: error.message,
            code: INVENTORY_ERROR_CODES.READ_FAILED,
          }
        }
        const movements = ((data ?? []) as KardexRow[]).map(mapKardexRow)
        return { ok: true, movements }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Erro ao ler kardex.',
          code: INVENTORY_ERROR_CODES.READ_FAILED,
        }
      }
    },
  }
}
