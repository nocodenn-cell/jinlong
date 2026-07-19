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

type VendaRow = {
  id: string
  caixa_id: string
  operador_id: string | null
  data: string
  status: string
  tipo_venda: string | null
  total_bruto: number | string | null
  total_desconto: number | string | null
  total_liquido: number | string | null
}

export function mapSaleRow(storeId: string, row: VendaRow): FactEnvelope {
  const descriptor = WAVE_A_DESCRIPTORS.SaleFact
  const gross = toFiniteNumber(row.total_bruto)
  const net = toFiniteNumber(row.total_liquido)
  const discount = toFiniteNumber(row.total_desconto)
  return buildReadyEnvelope({
    descriptor,
    factId: 'SaleFact',
    owner: 'sales',
    storeId,
    observedAt: isoOrNow(row.data),
    inputFingerprint: fingerprintParts(
      'SaleFact',
      row.id,
      gross,
      net,
      discount,
      row.status,
      row.data,
    ),
    payload: {
      saleId: row.id,
      storeId,
      operatorId: row.operador_id,
      occurredAt: row.data,
      status: row.status,
      saleType: row.tipo_venda,
      grossAmount: gross,
      discountAmount: discount,
      netAmount: net,
    },
  })
}

export function createSaleFactProvider(
  supabase: SupabaseClient,
): FactProviderPort {
  const descriptor = WAVE_A_DESCRIPTORS.SaleFact
  return {
    descriptor,
    async load(query: FactQuery): Promise<readonly FactEnvelope[]> {
      const caixaIds = await listCaixaIdsForStore(supabase, query.storeId)
      if (caixaIds.length === 0) return []

      const { fromIso, toIso } = resolveFactWindow(query)
      const { data, error } = await supabase
        .from('vendas')
        .select(
          'id,caixa_id,operador_id,data,status,tipo_venda,total_bruto,total_desconto,total_liquido',
        )
        .in('caixa_id', [...caixaIds])
        .eq('status', 'CONCLUIDA')
        .gte('data', fromIso)
        .lte('data', toIso)
        .order('data', { ascending: false })
        .limit(FACT_LOAD_LIMIT)

      if (error) throw new Error(`DI_PROVIDER_SALE: ${error.message}`)
      return (data ?? []).map((row) => mapSaleRow(query.storeId, row as VendaRow))
    },
  }
}
