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

type ArRow = {
  id: string
  loja_id: string
  cliente_id: string | null
  venda_id: string | null
  valor_total: number | string | null
  valor_aberto: number | string | null
  vencimento: string | null
  status: string
  created_at: string
}

export function mapArTitleRow(row: ArRow): FactEnvelope {
  const descriptor = WAVE_A_DESCRIPTORS.ArTitleFact
  const openAmount = toFiniteNumber(row.valor_aberto)
  return buildReadyEnvelope({
    descriptor,
    factId: 'ArTitleFact',
    owner: 'financial',
    storeId: row.loja_id,
    observedAt: isoOrNow(row.created_at),
    inputFingerprint: fingerprintParts(
      'ArTitleFact',
      row.id,
      openAmount,
      row.status,
      row.vencimento,
    ),
    payload: {
      titleId: row.id,
      storeId: row.loja_id,
      customerId: row.cliente_id,
      saleId: row.venda_id,
      total: toFiniteNumber(row.valor_total),
      openAmount,
      dueDate: row.vencimento,
      status: row.status,
      createdAt: row.created_at,
    },
  })
}

export function createArTitleFactProvider(
  supabase: SupabaseClient,
): FactProviderPort {
  const descriptor = WAVE_A_DESCRIPTORS.ArTitleFact
  return {
    descriptor,
    async load(query: FactQuery): Promise<readonly FactEnvelope[]> {
      const { data, error } = await supabase
        .from('contas_receber')
        .select(
          'id,loja_id,cliente_id,venda_id,valor_total,valor_aberto,vencimento,status,created_at',
        )
        .eq('loja_id', query.storeId)
        .limit(FACT_LOAD_LIMIT)
      if (error) throw new Error(`DI_PROVIDER_AR: ${error.message}`)
      return (data ?? []).map((row) => mapArTitleRow(row as ArRow))
    },
  }
}
