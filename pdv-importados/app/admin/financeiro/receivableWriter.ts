/**
 * Adapter ReceivableWriter / ReceivableLiquidationService — ADR-010.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateReceivableCommand,
  CreateReceivableResult,
  LiquidateReceivableCommand,
  LiquidateReceivableResult,
  ReceivableLiquidationService,
  ReceivableWriter,
} from '@shared-core/src/financial'
import {
  FINANCIAL_ERROR_CODES,
  validateCreateReceivableInput,
  validateLiquidateReceivableInput,
} from '@shared-core/src/financial'

export function createReceivableWriter(supabase: SupabaseClient): ReceivableWriter {
  return {
    async create(command: CreateReceivableCommand): Promise<CreateReceivableResult> {
      const v = validateCreateReceivableInput({
        clienteId: command.clienteId,
        valorTotal: command.valorTotal,
      })
      if (!v.ok) return { ok: false, error: v.error, code: v.code }
      try {
        const { data, error } = await supabase
          .from('contas_receber')
          .insert({
            cliente_id: command.clienteId,
            valor_total: command.valorTotal,
            valor_aberto: command.valorTotal,
            descricao: command.descricao?.trim() || null,
            vencimento: command.vencimento?.trim() || null,
            status: 'ABERTO',
          })
          .select('id')
          .single()
        if (error || !data) {
          return {
            ok: false,
            error: error?.message ?? 'Não foi possível criar o título.',
            code: FINANCIAL_ERROR_CODES.CREATE_FAILED,
          }
        }
        return { ok: true, tituloId: String(data.id) }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Não foi possível criar o título.',
          code: FINANCIAL_ERROR_CODES.CREATE_FAILED,
        }
      }
    },
  }
}

export function createReceivableLiquidationService(
  supabase: SupabaseClient,
): ReceivableLiquidationService {
  return {
    async liquidate(
      command: LiquidateReceivableCommand,
    ): Promise<LiquidateReceivableResult> {
      const v = validateLiquidateReceivableInput({
        tituloId: command.tituloId,
        valor: command.valor,
      })
      if (!v.ok) return { ok: false, error: v.error, code: v.code }
      try {
        const { data, error } = await supabase.rpc('registrar_liquidacao_receber', {
          p_titulo_id: command.tituloId,
          p_valor: command.valor,
          p_forma_pagamento: command.formaPagamento,
          p_observacao: command.observacao ?? null,
          p_idempotency_key: command.idempotencyKey,
          p_caixa_id: command.caixaId ?? null,
          p_origem: 'UI_FINANCEIRO',
        })
        if (error) {
          return {
            ok: false,
            error: error.message,
            code: FINANCIAL_ERROR_CODES.LIQUIDATE_FAILED,
          }
        }
        const row = (Array.isArray(data) ? data[0] : data) as {
          liquidacao_id?: unknown
          idempotent_replay?: unknown
          caixa_id?: unknown
        } | null
        if (!row?.liquidacao_id) {
          return { ok: false, error: 'Liquidação não retornou identificador.', code: FINANCIAL_ERROR_CODES.LIQUIDATE_FAILED }
        }
        return {
          ok: true,
          liquidacaoId: String(row.liquidacao_id),
          idempotentReplay: row.idempotent_replay === true,
          caixaId: row.caixa_id ? String(row.caixa_id) : null,
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha na liquidação.',
          code: FINANCIAL_ERROR_CODES.LIQUIDATE_FAILED,
        }
      }
    },
  }
}
