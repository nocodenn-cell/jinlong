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

type CliRow = {
  id: string
  loja_id: string
  nome: string
  documento: string | null
  ativo: boolean | null
  limite_credito: number | string | null
  created_at: string
}

export function mapCustomerRow(row: CliRow): FactEnvelope {
  const descriptor = WAVE_A_DESCRIPTORS.CustomerFact
  return buildReadyEnvelope({
    descriptor,
    factId: 'CustomerFact',
    owner: 'customers',
    storeId: row.loja_id,
    observedAt: isoOrNow(row.created_at),
    inputFingerprint: fingerprintParts(
      'CustomerFact',
      row.id,
      row.nome,
      row.documento,
      row.ativo,
      row.limite_credito,
    ),
    payload: {
      customerId: row.id,
      storeId: row.loja_id,
      name: row.nome,
      document: row.documento,
      active: Boolean(row.ativo),
      creditLimit: toFiniteNumber(row.limite_credito),
      createdAt: row.created_at,
    },
  })
}

export function createCustomerFactProvider(
  supabase: SupabaseClient,
): FactProviderPort {
  const descriptor = WAVE_A_DESCRIPTORS.CustomerFact
  return {
    descriptor,
    async load(query: FactQuery): Promise<readonly FactEnvelope[]> {
      const { data, error } = await supabase
        .from('clientes')
        .select('id,loja_id,nome,documento,ativo,limite_credito,created_at')
        .eq('loja_id', query.storeId)
        .limit(FACT_LOAD_LIMIT)
      if (error) throw new Error(`DI_PROVIDER_CUSTOMER: ${error.message}`)
      return (data ?? []).map((row) => mapCustomerRow(row as CliRow))
    },
  }
}
