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

type PayRow = {
  id: string
  venda_id: string
  forma_pagamento: string
  valor: number | string | null
  created_at: string
}

export function mapSalePaymentRow(storeId: string, row: PayRow): FactEnvelope {
  const descriptor = WAVE_A_DESCRIPTORS.SalePaymentFact
  return buildReadyEnvelope({
    descriptor,
    factId: 'SalePaymentFact',
    owner: 'sales',
    storeId,
    observedAt: isoOrNow(row.created_at),
    inputFingerprint: fingerprintParts(
      'SalePaymentFact',
      row.id,
      row.valor,
      row.forma_pagamento,
    ),
    payload: {
      paymentId: row.id,
      saleId: row.venda_id,
      method: row.forma_pagamento,
      amount: toFiniteNumber(row.valor),
      paidAt: row.created_at,
    },
  })
}

export function createSalePaymentFactProvider(
  supabase: SupabaseClient,
): FactProviderPort {
  const descriptor = WAVE_A_DESCRIPTORS.SalePaymentFact
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
        .eq('status', 'CONCLUIDA')
        .gte('data', fromIso)
        .lte('data', toIso)
        .limit(FACT_LOAD_LIMIT)
      if (vErr) throw new Error(`DI_PROVIDER_SALE_PAY_IDS: ${vErr.message}`)
      const saleIds = (vendas ?? []).map((r) => r.id as string)
      if (saleIds.length === 0) return []

      const { data, error } = await supabase
        .from('vendas_pagamentos')
        .select('id,venda_id,forma_pagamento,valor,created_at')
        .in('venda_id', saleIds)
        .limit(FACT_LOAD_LIMIT)
      if (error) throw new Error(`DI_PROVIDER_SALE_PAYMENT: ${error.message}`)
      return (data ?? []).map((row) =>
        mapSalePaymentRow(query.storeId, row as PayRow),
      )
    },
  }
}
