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
import { FACT_LOAD_LIMIT, resolveFactWindow } from '../shared/query-window'

type MovRow = {
  id: string
  loja_id: string
  produto_id: string
  tipo_codigo: string
  quantidade_delta: number | string | null
  usuario_id: string | null
  venda_id: string | null
  created_at: string
}

export function mapInventoryMovementRow(row: MovRow): FactEnvelope {
  const descriptor = WAVE_A_DESCRIPTORS.InventoryMovementFact
  return buildReadyEnvelope({
    descriptor,
    factId: 'InventoryMovementFact',
    owner: 'inventory',
    storeId: row.loja_id,
    observedAt: isoOrNow(row.created_at),
    inputFingerprint: fingerprintParts(
      'InventoryMovementFact',
      row.id,
      row.quantidade_delta,
      row.tipo_codigo,
    ),
    payload: {
      movementId: row.id,
      storeId: row.loja_id,
      productId: row.produto_id,
      typeCode: row.tipo_codigo,
      quantityDelta: toFiniteNumber(row.quantidade_delta),
      occurredAt: row.created_at,
      saleId: row.venda_id,
      actorId: row.usuario_id,
    },
  })
}

export function createInventoryMovementFactProvider(
  supabase: SupabaseClient,
): FactProviderPort {
  const descriptor = WAVE_A_DESCRIPTORS.InventoryMovementFact
  return {
    descriptor,
    async load(query: FactQuery): Promise<readonly FactEnvelope[]> {
      const { fromIso, toIso } = resolveFactWindow(query)
      const { data, error } = await supabase
        .from('movimentos_estoque_log')
        .select(
          'id,loja_id,produto_id,tipo_codigo,quantidade_delta,usuario_id,venda_id,created_at',
        )
        .eq('loja_id', query.storeId)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false })
        .limit(FACT_LOAD_LIMIT)
      if (error) throw new Error(`DI_PROVIDER_MOVEMENT: ${error.message}`)
      return (data ?? []).map((row) =>
        mapInventoryMovementRow(row as MovRow),
      )
    },
  }
}
