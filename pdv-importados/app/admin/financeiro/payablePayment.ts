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
  ReversePayableCommand,
  ReversePayableResult,
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
      if (!command.idempotencyKey?.trim()) {
        return {
          ok: false,
          error: 'Chave de idempotência obrigatória.',
          code: FINANCIAL_ERROR_CODES.VALUE_INVALID,
        }
      }
      try {
        // P1-4: era um UPDATE direto de `status`, que deixava pagamento
        // registrado e sangria aplicada sem contrapartida. A RPC estorna
        // integralmente os pagamentos realizados na mesma transação.
        const { error } = await supabase.rpc('cancelar_conta_pagar', {
          p_conta_id: command.contaId,
          p_motivo: command.motivo.trim(),
          p_idempotency_key: command.idempotencyKey,
          p_origem: 'UI_FINANCEIRO',
        })
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

    /**
     * Estorno de um pagamento. A RPC `estornar_pagamento_contas_pagar` já existia
     * no banco desde o P1-4 e nunca teve caminho de UI — corrigir um pagamento
     * errado exigia SQL. Aqui ela só ganha adapter; nenhuma regra muda.
     *
     * Devolve `status` e `valorPago` do título porque a própria RPC os retorna:
     * um re-fetch depois do estorno seria uma segunda ida ao banco para
     * descobrir algo que a transação já sabe.
     */
    async reverse(command: ReversePayableCommand): Promise<ReversePayableResult> {
      if (!command.pagamentoId?.trim()) {
        return {
          ok: false,
          error: 'Pagamento obrigatório.',
          code: FINANCIAL_ERROR_CODES.TITLE_REQUIRED,
        }
      }
      if (!(command.motivo ?? '').trim() || command.motivo.trim().length < 2) {
        return {
          ok: false,
          error: 'Motivo do estorno é obrigatório.',
          code: FINANCIAL_ERROR_CODES.VALUE_INVALID,
        }
      }
      if (!command.idempotencyKey?.trim()) {
        return {
          ok: false,
          error: 'Chave de idempotência obrigatória.',
          code: FINANCIAL_ERROR_CODES.VALUE_INVALID,
        }
      }
      try {
        const { data, error } = await supabase.rpc('estornar_pagamento_contas_pagar', {
          p_pagamento_id: command.pagamentoId,
          p_motivo: command.motivo.trim(),
          p_idempotency_key: command.idempotencyKey,
          p_origem: 'UI_FINANCEIRO',
        })
        if (error) {
          return { ok: false, error: error.message, code: FINANCIAL_ERROR_CODES.PAY_FAILED }
        }
        const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
        if (!row?.estorno_id) {
          return {
            ok: false,
            error: 'Estorno não retornou identificador.',
            code: FINANCIAL_ERROR_CODES.PAY_FAILED,
          }
        }
        return {
          ok: true,
          estornoId: String(row.estorno_id),
          idempotentReplay: row.idempotent_replay === true,
          status: String(row.status ?? ''),
          valorPago: Number(row.valor_pago ?? 0),
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha ao estornar.',
          code: FINANCIAL_ERROR_CODES.PAY_FAILED,
        }
      }
    },
  }
}
