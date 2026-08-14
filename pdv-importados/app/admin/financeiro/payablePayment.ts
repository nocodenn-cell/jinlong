/**
 * Adapter PayablePaymentService — ADR-010.
 * Autoridade: RPC `registrar_pagamento_contas_pagar` · UPDATE cancel (legado).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CancelPayableCommand,
  CancelPayableResult,
  PayPayableCommand,
  PayPayableResult,
  PayablePaymentService,
} from '@shared-core/src/financial'
import { FINANCIAL_ERROR_CODES } from '@shared-core/src/financial'

export function createPayablePaymentService(
  supabase: SupabaseClient,
): PayablePaymentService {
  return {
    async pay(command: PayPayableCommand): Promise<PayPayableResult> {
      if (!command.contaId?.trim()) {
        return {
          ok: false,
          error: 'Conta obrigatória.',
          code: FINANCIAL_ERROR_CODES.TITLE_REQUIRED,
        }
      }
      if (!Number.isFinite(command.valor) || command.valor <= 0) {
        return {
          ok: false,
          error: 'Valor deve ser maior que zero.',
          code: FINANCIAL_ERROR_CODES.VALUE_INVALID,
        }
      }
      try {
        const { data, error } = await supabase.rpc('registrar_pagamento_contas_pagar', {
          p_conta_id: command.contaId,
          p_valor: command.valor,
          p_forma: command.formaPagamento,
          p_data: command.data,
          p_observacao: command.observacao ?? null,
          p_idempotency_key: command.idempotencyKey,
          p_caixa_id: command.caixaId ?? null,
          p_origem: 'UI_FINANCEIRO',
          p_autorizacao_token: command.autorizacaoToken ?? null,
        })
        if (error) {
          return {
            ok: false,
            error: error.message,
            code: FINANCIAL_ERROR_CODES.PAY_FAILED,
          }
        }
        const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
        if (!row?.pagamento_id) {
          return { ok: false, error: 'Pagamento não retornou identificador.', code: FINANCIAL_ERROR_CODES.PAY_FAILED }
        }
        return {
          ok: true,
          pagamentoId: String(row.pagamento_id),
          idempotentReplay: row.idempotent_replay === true,
          caixaId: row.caixa_id ? String(row.caixa_id) : null,
          movimentacaoCaixaId: row.movimentacao_caixa_id ? String(row.movimentacao_caixa_id) : null,
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha no pagamento.',
          code: FINANCIAL_ERROR_CODES.PAY_FAILED,
        }
      }
    },

    async cancel(command: CancelPayableCommand): Promise<CancelPayableResult> {
      if (!command.contaId?.trim()) {
        return {
          ok: false,
          error: 'Conta obrigatória.',
          code: FINANCIAL_ERROR_CODES.TITLE_REQUIRED,
        }
      }
      if (!(command.motivo ?? '').trim() || command.motivo.trim().length < 2) {
        return {
          ok: false,
          error: 'Motivo do cancelamento é obrigatório.',
          code: FINANCIAL_ERROR_CODES.VALUE_INVALID,
        }
      }
      try {
        const { error } = await supabase
          .from('contas_pagar')
          .update({
            status: 'CANCELADO',
            cancelamento_motivo: command.motivo.trim(),
            cancelamento_em: new Date().toISOString(),
          })
          .eq('id', command.contaId)
          .in('status', ['PENDENTE', 'PARCIAL', 'ATRASADO'])
        if (error) {
          return {
            ok: false,
            error: error.message,
            code: FINANCIAL_ERROR_CODES.PAY_FAILED,
          }
        }
        return { ok: true }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha ao cancelar.',
          code: FINANCIAL_ERROR_CODES.PAY_FAILED,
        }
      }
    },
  }
}
