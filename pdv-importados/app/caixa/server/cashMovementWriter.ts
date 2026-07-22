/**
 * Adapter CashMovementWriter — ADR-009.
 * Autoridade: RPC `registrar_movimentacao`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CashMovementWriter,
  RegisterCashMovementCommand,
  RegisterCashMovementResult,
} from '@shared-core/src/cash'
import { CASH_ERROR_CODES, validateMovementInput } from '@shared-core/src/cash'

type RpcMovimentacaoResultRow = {
  movimentacao_id?: unknown
  status_movimentacao?: unknown
  saldo_atual?: unknown
}

function firstRow(data: unknown): RpcMovimentacaoResultRow | undefined {
  if (data == null) return undefined
  return (Array.isArray(data) ? data[0] : data) as RpcMovimentacaoResultRow
}

export function createCashMovementWriter(supabase: SupabaseClient): CashMovementWriter {
  return {
    async register(
      command: RegisterCashMovementCommand,
    ): Promise<RegisterCashMovementResult> {
      const validated = validateMovementInput({
        valor: command.valor,
        motivo: command.motivo,
        idempotencyKey: command.idempotencyKey,
      })
      if (!validated.ok) {
        return {
          ok: false,
          error:
            validated.code === CASH_ERROR_CODES.VALUE_INVALID
              ? 'Valor inválido.'
              : validated.code === CASH_ERROR_CODES.MOTIVO_REQUIRED
                ? 'Motivo obrigatório (mín. 2 caracteres).'
                : 'idempotencyKey é obrigatório.',
          code: validated.code,
        }
      }
      try {
        const { data, error } = await supabase.rpc('registrar_movimentacao', {
          p_caixa_id: command.caixaId,
          p_tipo: command.tipo,
          p_forma_pagamento: command.formaPagamento,
          p_valor: command.valor,
          p_motivo: command.motivo.trim(),
          p_motivo_codigo: (command.motivoCodigo ?? 'OUTRO').trim() || 'OUTRO',
          p_status: command.status ?? null,
          p_movimentacao_origem_id: command.movimentacaoOrigemId ?? null,
          p_idempotency_key: command.idempotencyKey.trim(),
          p_ip_address: command.ipAddress ?? null,
          p_user_agent: command.userAgent ?? null,
          p_device_id: command.deviceId?.trim() || null,
          p_terminal_id: command.terminalId?.trim() || null,
          p_operador_id: command.operadorId,
          p_gerente_id: command.gerenteId ?? null,
        })
        if (error) {
          return {
            ok: false,
            error: error.message,
            code: CASH_ERROR_CODES.MOVEMENT_FAILED,
          }
        }
        const row = firstRow(data)
        if (!row?.movimentacao_id) {
          return {
            ok: false,
            error: 'A movimentação não retornou identificador.',
            code: CASH_ERROR_CODES.MOVEMENT_FAILED,
          }
        }
        return {
          ok: true,
          movimentacaoId: String(row.movimentacao_id),
          status: String(row.status_movimentacao ?? ''),
          saldoAtual: Number(row.saldo_atual ?? 0),
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha ao registrar movimentação.',
          code: CASH_ERROR_CODES.MOVEMENT_FAILED,
        }
      }
    },
  }
}
