import type { SupabaseClient } from '@supabase/supabase-js'
import {
  WAVE_A_DESCRIPTORS,
  type FactEnvelope,
  type FactProviderPort,
  type FactQuery,
} from '@shared-core/src/intelligence'
import {
  buildReadyEnvelope,
  fingerprintParts,
  isoOrNow,
  toFiniteNumber,
} from '../shared/build-envelope'
import { FACT_LOAD_LIMIT } from '../shared/query-window'

type EstoqueRow = {
  id: string
  loja_id: string
  produto_id: string
  quantidade_atual: number | string | null
  estoque_minimo: number | string | null
  updated_at: string | null
  version?: number | null
}

export function mapStockPositionRow(row: EstoqueRow): FactEnvelope {
  const descriptor = WAVE_A_DESCRIPTORS.StockPositionFact
  const qty = toFiniteNumber(row.quantidade_atual)
  const min = toFiniteNumber(row.estoque_minimo)
  return buildReadyEnvelope({
    descriptor,
    factId: 'StockPositionFact',
    owner: 'inventory',
    storeId: row.loja_id,
    observedAt: isoOrNow(row.updated_at),
    inputFingerprint: fingerprintParts(
      'StockPositionFact',
      row.id,
      qty,
      min,
      row.version,
      row.updated_at,
    ),
    payload: {
      storeId: row.loja_id,
      productId: row.produto_id,
      quantityOnHand: qty,
      minQuantity: min,
      updatedAt: row.updated_at,
    },
  })
}

export function createStockPositionFactProvider(
  supabase: SupabaseClient,
): FactProviderPort {
  const descriptor = WAVE_A_DESCRIPTORS.StockPositionFact
  return {
    descriptor,
    async load(query: FactQuery): Promise<readonly FactEnvelope[]> {
      const { data, error } = await supabase
        .from('estoque')
        .select(
          'id,loja_id,produto_id,quantidade_atual,estoque_minimo,updated_at,version',
        )
        .eq('loja_id', query.storeId)
        .limit(FACT_LOAD_LIMIT)
      if (error) throw new Error(`DI_PROVIDER_STOCK: ${error.message}`)
      return (data ?? []).map((row) => mapStockPositionRow(row as EstoqueRow))
    },
  }
}
