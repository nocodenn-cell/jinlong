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

type PriceRow = {
  id: string
  loja_id: string
  preco_varejo: number | string | null
  preco_atacado: number | string | null
  updated_at: string | null
}

export function mapProductPriceRow(row: PriceRow): FactEnvelope {
  const descriptor = WAVE_A_DESCRIPTORS.ProductPriceFact
  const listRetail = toFiniteNumber(row.preco_varejo)
  const listWholesale = toFiniteNumber(row.preco_atacado)
  return buildReadyEnvelope({
    descriptor,
    factId: 'ProductPriceFact',
    owner: 'products',
    storeId: row.loja_id,
    observedAt: isoOrNow(row.updated_at),
    inputFingerprint: fingerprintParts(
      'ProductPriceFact',
      row.id,
      listRetail,
      listWholesale,
    ),
    payload: {
      productId: row.id,
      listRetail,
      listWholesale,
      effectivePrice: listRetail,
    },
  })
}

export function createProductPriceFactProvider(
  supabase: SupabaseClient,
): FactProviderPort {
  const descriptor = WAVE_A_DESCRIPTORS.ProductPriceFact
  return {
    descriptor,
    async load(query: FactQuery): Promise<readonly FactEnvelope[]> {
      const { data, error } = await supabase
        .from('produtos')
        .select('id,loja_id,preco_varejo,preco_atacado,updated_at')
        .eq('loja_id', query.storeId)
        .limit(FACT_LOAD_LIMIT)
      if (error) throw new Error(`DI_PROVIDER_PRODUCT_PRICE: ${error.message}`)
      return (data ?? []).map((row) => mapProductPriceRow(row as PriceRow))
    },
  }
}
