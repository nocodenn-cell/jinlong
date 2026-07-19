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

type FornRow = {
  id: string
  cnpj: string | null
  nome: string
  updated_at: string | null
  created_at: string
}

/**
 * Fornecedores são globais (sem loja_id). Escopo = storeId da query
 * apenas para envelope; payload não inventa vínculo.
 */
export function mapSupplierRow(storeId: string, row: FornRow): FactEnvelope {
  const descriptor = WAVE_A_DESCRIPTORS.SupplierFact
  return buildReadyEnvelope({
    descriptor,
    factId: 'SupplierFact',
    owner: 'suppliers',
    storeId,
    observedAt: isoOrNow(row.updated_at ?? row.created_at),
    inputFingerprint: fingerprintParts(
      'SupplierFact',
      row.id,
      row.cnpj,
      row.nome,
    ),
    payload: {
      supplierId: row.id,
      taxId: row.cnpj,
      name: row.nome,
    },
  })
}

export function createSupplierFactProvider(
  supabase: SupabaseClient,
): FactProviderPort {
  const descriptor = WAVE_A_DESCRIPTORS.SupplierFact
  return {
    descriptor,
    async load(query: FactQuery): Promise<readonly FactEnvelope[]> {
      const { data, error } = await supabase
        .from('fornecedores')
        .select('id,cnpj,nome,updated_at,created_at')
        .limit(FACT_LOAD_LIMIT)
      if (error) throw new Error(`DI_PROVIDER_SUPPLIER: ${error.message}`)
      return (data ?? []).map((row) =>
        mapSupplierRow(query.storeId, row as FornRow),
      )
    },
  }
}
