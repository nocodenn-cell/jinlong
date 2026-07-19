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
} from '../shared/build-envelope'
import { FACT_LOAD_LIMIT } from '../shared/query-window'

type ProdRow = {
  id: string
  loja_id: string
  nome: string
  codigo_barras: string | null
  categoria_id: string | null
  marca_id: string | null
  fornecedor_id: string | null
  ativo: boolean | null
  status_publicacao: string | null
  updated_at: string | null
}

export function mapProductRow(row: ProdRow): FactEnvelope {
  const descriptor = WAVE_A_DESCRIPTORS.ProductFact
  return buildReadyEnvelope({
    descriptor,
    factId: 'ProductFact',
    owner: 'products',
    storeId: row.loja_id,
    observedAt: isoOrNow(row.updated_at),
    inputFingerprint: fingerprintParts(
      'ProductFact',
      row.id,
      row.nome,
      row.codigo_barras,
      row.ativo,
      row.status_publicacao,
    ),
    payload: {
      productId: row.id,
      storeId: row.loja_id,
      name: row.nome,
      skuCodes: row.codigo_barras ? [row.codigo_barras] : [],
      categoryId: row.categoria_id,
      brandId: row.marca_id,
      supplierId: row.fornecedor_id,
      active: Boolean(row.ativo),
      publishStatus: row.status_publicacao,
    },
  })
}

export function createProductFactProvider(
  supabase: SupabaseClient,
): FactProviderPort {
  const descriptor = WAVE_A_DESCRIPTORS.ProductFact
  return {
    descriptor,
    async load(query: FactQuery): Promise<readonly FactEnvelope[]> {
      const { data, error } = await supabase
        .from('produtos')
        .select(
          'id,loja_id,nome,codigo_barras,categoria_id,marca_id,fornecedor_id,ativo,status_publicacao,updated_at',
        )
        .eq('loja_id', query.storeId)
        .limit(FACT_LOAD_LIMIT)
      if (error) throw new Error(`DI_PROVIDER_PRODUCT: ${error.message}`)
      return (data ?? []).map((row) => mapProductRow(row as ProdRow))
    },
  }
}
