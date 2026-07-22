/**
 * Adapter InventoryQueryService — grade admin `/admin/estoque`.
 * Autoridade: RPC `gerente_estoque_list_page` (Postgres).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  InventoryQueryService,
  InventoryStockListQuery,
  InventoryStockListResult,
  InventoryStockListRow,
} from '@shared-core/src/inventory'
import { INVENTORY_ERROR_CODES } from '@shared-core/src/inventory'

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (v == null) return null
  return String(v)
}

export function mapStockListRpcRow(raw: Record<string, unknown>): InventoryStockListRow {
  return {
    productId: String(raw.id),
    nome: String(raw.nome ?? ''),
    codigoBarras: str(raw.codigo_barras),
    unidadeMedida: String(raw.unidade_medida ?? 'UN'),
    origem: String(raw.origem ?? ''),
    categoriaId: str(raw.categoria_id),
    estoqueId: str(raw.estoque_id),
    quantity: num(raw.quantidade_atual),
    minimum: num(raw.estoque_minimo),
    deficit: num(raw.deficit),
  }
}

function parseListaPayload(raw: unknown): { total: number; rows: InventoryStockListRow[] } {
  if (!raw || typeof raw !== 'object') return { total: 0, rows: [] }
  const o = raw as Record<string, unknown>
  const total = typeof o.total === 'number' ? o.total : Number(o.total) || 0
  const rowsRaw = o.rows
  if (!Array.isArray(rowsRaw)) return { total, rows: [] }
  return {
    total,
    rows: rowsRaw.map((r) => mapStockListRpcRow(r as Record<string, unknown>)),
  }
}

export function createInventoryQueryService(
  supabase: SupabaseClient,
): InventoryQueryService {
  return {
    async listStockPage(query: InventoryStockListQuery): Promise<InventoryStockListResult> {
      try {
        const { data, error } = await supabase.rpc('gerente_estoque_list_page', {
          p_loja_id: query.lojaId,
          p_visao: query.visao,
          p_busca: query.busca ?? '',
          p_categoria_id: query.categoriaId ?? null,
          p_origem: query.origem ?? '',
          p_ordem: query.ordem ?? 'nome',
          p_dir_asc: query.dirAsc ?? true,
          p_limite: query.limite ?? 25,
          p_offset: query.offset ?? 0,
        })
        if (error) {
          return {
            ok: false,
            error: error.message,
            code: INVENTORY_ERROR_CODES.LIST_FAILED,
          }
        }
        const parsed = parseListaPayload(data)
        return { ok: true, total: parsed.total, rows: parsed.rows }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Erro ao listar estoque.',
          code: INVENTORY_ERROR_CODES.LIST_FAILED,
        }
      }
    },
  }
}
