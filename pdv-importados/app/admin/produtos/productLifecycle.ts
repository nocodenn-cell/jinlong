/**
 * Adapter ProductLifecycleService — Missão Products 10 / ADR-007.
 * Dual-write `status_publicacao` + `ativo` via `dualWriteFromStatus`.
 * Erros por code (borda i18n); sem mensagens PT longas.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PRODUCT_ERROR_CODES,
  type ProductLifecycleService,
  type SetProductStatusCommand,
  type SetProductStatusLoteCommand,
  type SetProductStatusLoteResult,
  type SetProductStatusResult,
} from '@shared-core/src/products'
import { dualWriteFromStatus } from '@/core/catalog/statusPublicacao'

type LifecycleRow = ReturnType<typeof dualWriteFromStatus>

type UpdateOutcome = {
  error: { message: string } | null
  count: number
}

function failLifecycle(error?: string): {
  ok: false
  error: string
  code: typeof PRODUCT_ERROR_CODES.LIFECYCLE_FAILED
} {
  const code = PRODUCT_ERROR_CODES.LIFECYCLE_FAILED
  return { ok: false, error: error ?? code, code }
}

function notFoundResult(): {
  ok: false
  error: string
  code: typeof PRODUCT_ERROR_CODES.NOT_FOUND
  notFound: true
} {
  const code = PRODUCT_ERROR_CODES.NOT_FOUND
  return { ok: false, error: code, code, notFound: true }
}

function mapUpdateOutcome(
  data: { id: string }[] | null,
  error: { message: string } | null,
  count: number | null,
): UpdateOutcome {
  if (error) return { error, count: 0 }
  return { error: null, count: count ?? data?.length ?? 0 }
}

async function updateOne(
  supabase: SupabaseClient,
  id: string,
  lojaId: string,
  payload: LifecycleRow,
): Promise<UpdateOutcome> {
  const { data, error } = await supabase
    .from('produtos')
    .update(payload)
    .eq('id', id)
    .eq('loja_id', lojaId)
    .select('id')
  const rows = data as { id: string }[] | null
  return mapUpdateOutcome(rows, error, rows?.length ?? 0)
}

async function updateLote(
  supabase: SupabaseClient,
  ids: string[],
  lojaId: string,
  payload: LifecycleRow,
): Promise<UpdateOutcome> {
  const { data, error } = await supabase
    .from('produtos')
    .update(payload)
    .in('id', ids)
    .eq('loja_id', lojaId)
    .select('id')
  const rows = data as { id: string }[] | null
  return mapUpdateOutcome(rows, error, rows?.length ?? 0)
}

async function runSetStatus(
  supabase: SupabaseClient,
  command: SetProductStatusCommand,
): Promise<SetProductStatusResult> {
  const payload = dualWriteFromStatus(command.status)
  const { error, count } = await updateOne(
    supabase,
    command.id,
    command.lojaId,
    payload,
  )
  if (error) return failLifecycle(PRODUCT_ERROR_CODES.LIFECYCLE_FAILED)
  if (count === 0) return notFoundResult()
  return { ok: true }
}

async function runSetStatusLote(
  supabase: SupabaseClient,
  command: SetProductStatusLoteCommand,
): Promise<SetProductStatusLoteResult> {
  const payload = dualWriteFromStatus(command.status)
  const { error, count } = await updateLote(
    supabase,
    command.ids,
    command.lojaId,
    payload,
  )
  if (error) return failLifecycle(PRODUCT_ERROR_CODES.LIFECYCLE_FAILED)
  return { ok: true, atualizados: count }
}

/**
 * Factory ProductLifecycleService — UPDATE status de publicação (catálogo).
 */
export function createProductLifecycleService(
  supabase: SupabaseClient,
): ProductLifecycleService {
  return {
    async setStatus(command: SetProductStatusCommand): Promise<SetProductStatusResult> {
      try {
        return await runSetStatus(supabase, command)
      } catch (e) {
        return failLifecycle(
          e instanceof Error ? e.message : PRODUCT_ERROR_CODES.LIFECYCLE_FAILED,
        )
      }
    },

    async setStatusLote(
      command: SetProductStatusLoteCommand,
    ): Promise<SetProductStatusLoteResult> {
      try {
        return await runSetStatusLote(supabase, command)
      } catch (e) {
        return failLifecycle(
          e instanceof Error ? e.message : PRODUCT_ERROR_CODES.LIFECYCLE_FAILED,
        )
      }
    },
  }
}
