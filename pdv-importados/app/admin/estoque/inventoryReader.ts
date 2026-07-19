/**
 * Adapter de leitura — InventoryReader (Missão Inventory 3 / ADR-008).
 * Saldo pontual em `estoque` apenas. Sem grade admin, sem kardex, sem mutação.
 * Escopo de loja: injetado na factory (borda/sessão).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  InventoryBalanceResult,
  InventoryBalancesResult,
  InventoryItem,
  InventoryReader,
  LojaId,
  ProductId,
} from '@shared-core/src/inventory'

const ESTOQUE_COLS = 'produto_id, loja_id, quantidade_atual, estoque_minimo'

/** Linha mínima de `estoque` para o map de domínio. */
export type EstoqueRow = {
  produto_id: string
  loja_id: string
  quantidade_atual: number | string
  estoque_minimo: number | string
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Mapeia linha SQL → InventoryItem.
 * `available` = `quantity` (sem reservas); `minimum` = `estoque_minimo`.
 */
export function mapEstoqueRow(r: EstoqueRow): InventoryItem {
  const quantity = toNumber(r.quantidade_atual)
  return {
    productId: r.produto_id,
    lojaId: r.loja_id,
    quantity,
    available: quantity,
    minimum: toNumber(r.estoque_minimo),
  }
}

function notFoundResult(): Extract<InventoryBalanceResult, { ok: false }> {
  return {
    ok: false,
    error: 'Estoque não encontrado para o produto nesta loja.',
    notFound: true,
  }
}

function readFailed(message?: string): Extract<InventoryBalancesResult, { ok: false }> {
  return {
    ok: false,
    error: message || 'Erro ao consultar estoque.',
  }
}

/**
 * Factory — implementa `InventoryReader` contra tabela `estoque`.
 */
export function createInventoryReader(
  supabase: SupabaseClient,
  lojaId: LojaId,
): InventoryReader {
  return {
    async getBalance(productId: ProductId): Promise<InventoryBalanceResult> {
      try {
        const { data, error } = await supabase
          .from('estoque')
          .select(ESTOQUE_COLS)
          .eq('produto_id', productId)
          .eq('loja_id', lojaId)
          .maybeSingle()

        if (error) {
          return { ok: false, error: error.message }
        }
        if (!data) return notFoundResult()
        return { ok: true, item: mapEstoqueRow(data as EstoqueRow) }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Erro ao consultar estoque.',
        }
      }
    },

    async getBalances(
      productIds: readonly ProductId[],
    ): Promise<InventoryBalancesResult> {
      if (productIds.length === 0) {
        return { ok: true, items: [] }
      }
      try {
        const { data, error } = await supabase
          .from('estoque')
          .select(ESTOQUE_COLS)
          .eq('loja_id', lojaId)
          .in('produto_id', [...productIds])

        if (error) return readFailed(error.message)

        const items = ((data ?? []) as EstoqueRow[]).map(mapEstoqueRow)
        return { ok: true, items }
      } catch (e) {
        return readFailed(e instanceof Error ? e.message : undefined)
      }
    },
  }
}
