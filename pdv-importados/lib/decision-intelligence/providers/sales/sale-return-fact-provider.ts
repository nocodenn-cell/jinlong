import type { SupabaseClient } from '@supabase/supabase-js'
import {
  WAVE_A_DESCRIPTORS,
  type FactEnvelope,
  type FactProviderPort,
  type FactQuery,
} from '@shared-core/src/intelligence'
import { listCaixaIdsForStore } from '../shared/caixa-ids'
import {
  buildReadyEnvelope,
  fingerprintParts,
  isoOrNow,
  toFiniteNumber,
} from '../shared/build-envelope'
import { FACT_LOAD_LIMIT, resolveFactWindow } from '../shared/query-window'

type ReturnRow = {
  id: string
  venda_id: string
  valor: number | string | null
  forma_pagamento: string | null
  motivo: string | null
  created_at: string
}

export function mapSaleReturnRow(storeId: string, row: ReturnRow): FactEnvelope {
  const descriptor = WAVE_A_DESCRIPTORS.SaleReturnFact
  return buildReadyEnvelope({
    descriptor,
    factId: 'SaleReturnFact',
    owner: 'sales',
    storeId,
    observedAt: isoOrNow(row.created_at),
    inputFingerprint: fingerprintParts(
      'SaleReturnFact',
      row.id,
      row.valor,
      row.forma_pagamento,
    ),
    payload: {
      returnId: row.id,
      saleId: row.venda_id,
      amount: toFiniteNumber(row.valor),
      method: row.forma_pagamento,
      reason: row.motivo,
      returnedAt: row.created_at,
    },
  })
}

export function createSaleReturnFactProvider(
  supabase: SupabaseClient,
): FactProviderPort {
  const descriptor = WAVE_A_DESCRIPTORS.SaleReturnFact
  return {
    descriptor,
    async load(query: FactQuery): Promise<readonly FactEnvelope[]> {
      const caixaIds = await listCaixaIdsForStore(supabase, query.storeId)
      if (caixaIds.length === 0) return []
      const { fromIso, toIso } = resolveFactWindow(query)
      const { data: vendas, error: vErr } = await supabase
        .from('vendas')
        .select('id')
        .in('caixa_id', [...caixaIds])
        .gte('data', fromIso)
        .lte('data', toIso)
        .limit(FACT_LOAD_LIMIT)
      if (vErr) throw new Error(`DI_PROVIDER_RETURN_IDS: ${vErr.message}`)
      const saleIds = (vendas ?? []).map((r) => r.id as string)
      if (saleIds.length === 0) return []

      const { data, error } = await supabase
        .from('devolucoes')
        .select('id,venda_id,valor,forma_pagamento,motivo,created_at')
        .in('venda_id', saleIds)
        .limit(FACT_LOAD_LIMIT)
      if (error) throw new Error(`DI_PROVIDER_SALE_RETURN: ${error.message}`)
      return (data ?? []).map((row) =>
        mapSaleReturnRow(query.storeId, row as ReturnRow),
      )
    },
  }
}
