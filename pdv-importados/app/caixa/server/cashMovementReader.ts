/**
 * Adapter CashMovementReader — ADR-009.
 * Listagem de movimentações por caixa (sem mutação).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CashMovement,
  CashMovementReader,
  CaixaId,
  ListCashMovementsResult,
} from '@shared-core/src/cash'
import { CASH_ERROR_CODES } from '@shared-core/src/cash'
import type {
  FormaMovimentacaoCaixa,
  MovimentacaoCaixaDTO,
  StatusMovimentacaoCaixa,
  TipoMovimentacaoCaixa,
} from '@/app/caixa/caixaMovimentacaoTypes'
import { caixaMsgOperador } from '@/app/caixa/server/caixaMensagensServidor'

const MOV_COLS =
  'id, numero_sequencial, caixa_id, operador_id, gerente_id, tipo, forma_pagamento, valor, motivo_codigo, motivo, status, movimentacao_origem_id, saldo_antes, saldo_depois, created_at'

type MovRow = {
  id: string
  numero_sequencial: number | null
  caixa_id: string
  operador_id: string
  gerente_id: string | null
  tipo: string
  forma_pagamento: string
  valor: number
  motivo_codigo: string | null
  motivo: string | null
  status: string
  movimentacao_origem_id: string | null
  saldo_antes: number | null
  saldo_depois: number | null
  created_at: string
}

async function fetchMovRows(
  supabase: SupabaseClient,
  caixaId: string,
): Promise<{ ok: true; rows: MovRow[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('movimentacoes_caixa')
    .select(MOV_COLS)
    .eq('caixa_id', caixaId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: (data ?? []) as MovRow[] }
}

function toDomain(row: MovRow): CashMovement {
  return {
    movimentacaoId: row.id,
    caixaId: row.caixa_id,
    tipo: row.tipo,
    valor: Number(row.valor ?? 0),
    status: row.status,
    motivo: row.motivo != null ? String(row.motivo) : null,
    createdAt: row.created_at ?? null,
  }
}

function toDto(row: MovRow): MovimentacaoCaixaDTO {
  return {
    id: row.id,
    numeroSequencial: row.numero_sequencial ? Number(row.numero_sequencial) : null,
    caixaId: row.caixa_id,
    operadorId: row.operador_id,
    gerenteId: row.gerente_id,
    tipo: row.tipo as TipoMovimentacaoCaixa,
    formaPagamento: row.forma_pagamento as FormaMovimentacaoCaixa,
    valor: Number(row.valor ?? 0),
    motivoCodigo: String(row.motivo_codigo ?? 'OUTRO'),
    motivo: String(row.motivo ?? ''),
    status: row.status as StatusMovimentacaoCaixa,
    movimentacaoOrigemId: row.movimentacao_origem_id,
    saldoAntes: Number(row.saldo_antes ?? 0),
    saldoDepois: Number(row.saldo_depois ?? 0),
    createdAt: row.created_at,
  }
}

export function createCashMovementReader(supabase: SupabaseClient): CashMovementReader {
  return {
    async listByCaixa(caixaId: CaixaId): Promise<ListCashMovementsResult> {
      if (!caixaId.trim()) {
        return {
          ok: false,
          error: await caixaMsgOperador('err_srv_caixa_invalido'),
          code: CASH_ERROR_CODES.READ_FAILED,
        }
      }
      try {
        const fetched = await fetchMovRows(supabase, caixaId)
        if (!fetched.ok) {
          return {
            ok: false,
            error: fetched.error,
            code: CASH_ERROR_CODES.READ_FAILED,
          }
        }
        return { ok: true, movements: fetched.rows.map(toDomain) }
      } catch (e) {
        return {
          ok: false,
          error:
            e instanceof Error ? e.message : await caixaMsgOperador('err_srv_carregar_movimentacoes'),
          code: CASH_ERROR_CODES.READ_FAILED,
        }
      }
    },
  }
}

/** Mesma query do reader — DTO de borda do PDV (timeline). */
export async function listMovimentacoesCaixaDto(
  supabase: SupabaseClient,
  caixaId: string,
): Promise<{ ok: true; itens: MovimentacaoCaixaDTO[] } | { ok: false; error: string }> {
  if (!caixaId.trim()) return { ok: false, error: await caixaMsgOperador('err_srv_caixa_invalido') }
  try {
    const fetched = await fetchMovRows(supabase, caixaId)
    if (!fetched.ok) return { ok: false, error: fetched.error }
    return { ok: true, itens: fetched.rows.map(toDto) }
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : await caixaMsgOperador('err_srv_carregar_movimentacoes'),
    }
  }
}
