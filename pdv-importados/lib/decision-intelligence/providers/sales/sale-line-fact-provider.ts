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

type ItemRow = {
  id: string
  venda_id: string
  produto_id: string
  quantidade: number | string | null
  preco_unitario: number | string | null
  desconto_unitario: number | string | null
  custo_unitario_snap: number | string | null
  tipo_preco: string | null
  created_at?: string | null
}

export function mapSaleLineRow(storeId: string, row: ItemRow): FactEnvelope {
  const descriptor = WAVE_A_DESCRIPTORS.SaleLineFact
  return buildReadyEnvelope({
    descriptor,
    factId: 'SaleLineFact',
    owner: 'sales',
    storeId,
    observedAt: isoOrNow(row.created_at),
    inputFingerprint: fingerprintParts(
      'SaleLineFact',
      row.id,
      row.quantidade,
      row.preco_unitario,
      row.desconto_unitario,
    ),
    payload: {
      saleLineId: row.id,
      saleId: row.venda_id,
      productId: row.produto_id,
      quantity: toFiniteNumber(row.quantidade),
      unitPrice: toFiniteNumber(row.preco_unitario),
      unitDiscount: toFiniteNumber(row.desconto_unitario),
      unitCostSnap: toFiniteNumber(row.custo_unitario_snap),
      priceType: row.tipo_preco,
    },
  })
}

async function listSaleIdsInWindow(
  supabase: SupabaseClient,
  storeId: string,
  query: FactQuery,
): Promise<readonly string[]> {
  const caixaIds = await listCaixaIdsForStore(supabase, storeId)
  if (caixaIds.length === 0) return []
  const { fromIso, toIso } = resolveFactWindow(query)
  const { data, error } = await supabase
    .from('vendas')
    .select('id')
    .in('caixa_id', [...caixaIds])
    .eq('status', 'CONCLUIDA')
    .gte('data', fromIso)
    .lte('data', toIso)
    .limit(FACT_LOAD_LIMIT)
  if (error) throw new Error(`DI_PROVIDER_SALE_IDS: ${error.message}`)
  return (data ?? []).map((r) => r.id as string)
}

export function createSaleLineFactProvider(
  supabase: SupabaseClient,
): FactProviderPort {
  const descriptor = WAVE_A_DESCRIPTORS.SaleLineFact
  return {
    descriptor,
    async load(query: FactQuery): Promise<readonly FactEnvelope[]> {
      const saleIds = await listSaleIdsInWindow(supabase, query.storeId, query)
      if (saleIds.length === 0) return []

      const { data, error } = await supabase
        .from('itens_venda')
        .select(
          'id,venda_id,produto_id,quantidade,preco_unitario,desconto_unitario,custo_unitario_snap,tipo_preco',
        )
        .in('venda_id', [...saleIds])
        .limit(FACT_LOAD_LIMIT)

      if (error) throw new Error(`DI_PROVIDER_SALE_LINE: ${error.message}`)
      return (data ?? []).map((row) =>
        mapSaleLineRow(query.storeId, row as ItemRow),
      )
    },
  }
}
