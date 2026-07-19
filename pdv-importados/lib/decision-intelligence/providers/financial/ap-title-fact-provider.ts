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

type ApRow = {
  id: string
  loja_id: string
  fornecedor_id: string | null
  valor_total: number | string | null
  valor_pago: number | string | null
  vencimento: string | null
  status: string
  nfe_numero: string | null
  criado_em: string
}

export function mapApTitleRow(row: ApRow): FactEnvelope {
  const descriptor = WAVE_A_DESCRIPTORS.ApTitleFact
  const total = toFiniteNumber(row.valor_total)
  const paid = toFiniteNumber(row.valor_pago)
  const openAmount = Math.max(0, total - paid)
  return buildReadyEnvelope({
    descriptor,
    factId: 'ApTitleFact',
    owner: 'financial',
    storeId: row.loja_id,
    observedAt: isoOrNow(row.criado_em),
    inputFingerprint: fingerprintParts(
      'ApTitleFact',
      row.id,
      openAmount,
      row.status,
      row.vencimento,
    ),
    payload: {
      titleId: row.id,
      storeId: row.loja_id,
      supplierId: row.fornecedor_id,
      total,
      paidAmount: paid,
      openAmount,
      dueDate: row.vencimento,
      status: row.status,
      nfeRef: row.nfe_numero,
    },
  })
}

export function createApTitleFactProvider(
  supabase: SupabaseClient,
): FactProviderPort {
  const descriptor = WAVE_A_DESCRIPTORS.ApTitleFact
  return {
    descriptor,
    async load(query: FactQuery): Promise<readonly FactEnvelope[]> {
      const { data, error } = await supabase
        .from('contas_pagar')
        .select(
          'id,loja_id,fornecedor_id,valor_total,valor_pago,vencimento,status,nfe_numero,criado_em',
        )
        .eq('loja_id', query.storeId)
        .limit(FACT_LOAD_LIMIT)
      if (error) throw new Error(`DI_PROVIDER_AP: ${error.message}`)
      return (data ?? []).map((row) => mapApTitleRow(row as ApRow))
    },
  }
}
