/**
 * Adapter InventoryMovementReader — kardex read-only.
 * SELECT `v_kardex_unificado` — fonte canônica (291 + anti-join erd em
 * 20260828110000). UNION de `movimentos_estoque_log` + `estoque_baixas`
 * legado (anti-join SAIDA_VENDA) + devoluções só-erd (anti-join por
 * operacao_id na observação) + cancelamento. Pós-#313 o log físico já
 * cobre devolução nova; o ramo erd fica só para legado sem lançamento.
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

const KARDEX_COLS = 'evento_id, ocorrido_em, tipo_codigo, quantidade_delta, observacao, produto_id'
const DEFAULT_LIMIT = 60

type KardexRow = {
  evento_id: string
  ocorrido_em: string
  tipo_codigo: string
  quantidade_delta: number | string
  observacao: string | null
  produto_id: string
}

export function mapKardexRow(r: KardexRow): InventoryMovement {
  return {
    movementId: String(r.evento_id),
    productId: String(r.produto_id),
    type: String(r.tipo_codigo ?? ''),
    quantity: Number(r.quantidade_delta ?? 0),
    reason: r.observacao == null ? null : String(r.observacao),
    createdAt: String(r.ocorrido_em),
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
          .from('v_kardex_unificado')
          .select(KARDEX_COLS)
          .eq('produto_id', query.productId)
          .eq('loja_id', lojaId)
          .order('ocorrido_em', { ascending: false })
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
