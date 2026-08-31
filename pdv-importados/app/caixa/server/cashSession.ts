/**
 * Adapter CashSessionReader / CashSessionWriter — ADR-009.
 * Autoridade: INSERT caixas (abrir) · RPC fechar_caixa_atomico · RPC status.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CashSessionReader,
  CashSessionStatusResult,
  CashSessionWriter,
  CloseCashSessionCommand,
  CloseCashSessionResult,
  OpenCashSessionCommand,
  OpenCashSessionResult,
  OperadorId,
} from '@shared-core/src/cash'
import {
  CASH_ERROR_CODES,
  validateCashMoneyValue,
  validateCloseMotivo,
} from '@shared-core/src/cash'
import { idiomaOperadorParaErro } from '@/app/caixa/server/caixaErroOperador'
import { caixaMsgOperador, caixaMsgServidor } from '@/app/caixa/server/caixaMensagensServidor'

type RpcStatusRow = {
  status: string
  caixa_id: string | null
  data_abertura: string | null
  valor_inicial: number | null
  valor_sistema_dinheiro: number | null
  blind_closure_enabled: boolean | null
  mensagem_operador: string | null
}

type RpcFecharRow = {
  o_caixa_id: string
  o_valor_sistema: number
  o_valor_contado: number
  o_diferenca: number
  o_ja_fechado: boolean
}

export function createCashSessionReader(supabase: SupabaseClient): CashSessionReader {
  return {
    async getStatus(operadorId: OperadorId): Promise<CashSessionStatusResult> {
      const idioma = await idiomaOperadorParaErro()
      try {
        const { data, error } = await supabase.rpc('obter_status_caixa_operador', {
          p_operador_id: operadorId,
        })
        if (error) {
          return {
            ok: false,
            status: 'ERRO',
            error: error.message,
            code: CASH_ERROR_CODES.READ_FAILED,
          }
        }
        const row = (Array.isArray(data) ? data[0] : data) as RpcStatusRow | undefined
        if (!row?.status) {
          return {
            ok: false,
            status: 'ERRO',
            error: caixaMsgServidor(idioma, 'err_srv_status_caixa_indisponivel'),
            code: CASH_ERROR_CODES.READ_FAILED,
          }
        }
        if (row.status === 'ERRO') {
          return {
            ok: false,
            status: 'ERRO',
            error:
              row.mensagem_operador?.trim() ||
              caixaMsgServidor(idioma, 'err_srv_status_caixa_indisponivel'),
            code: CASH_ERROR_CODES.READ_FAILED,
          }
        }
        if (row.status === 'FECHADO') {
          return { ok: true, status: 'FECHADO' }
        }
        return {
          ok: true,
          status: 'ABERTO',
          session: {
            caixaId: String(row.caixa_id),
            status: 'ABERTO',
            dataAbertura: String(row.data_abertura),
            valorInicial: Number(row.valor_inicial ?? 0),
            valorSistemaDinheiro: Number(row.valor_sistema_dinheiro ?? 0),
            blindClosureEnabled: Boolean(row.blind_closure_enabled),
          },
        }
      } catch (e) {
        return {
          ok: false,
          status: 'ERRO',
          error: e instanceof Error ? e.message : caixaMsgServidor(idioma, 'err_srv_status_caixa_indisponivel'),
          code: CASH_ERROR_CODES.READ_FAILED,
        }
      }
    },
  }
}

export function createCashSessionWriter(supabase: SupabaseClient): CashSessionWriter {
  const reader = createCashSessionReader(supabase)
  return {
    async open(command: OpenCashSessionCommand): Promise<OpenCashSessionResult> {
      const idioma = await idiomaOperadorParaErro()
      const money = validateCashMoneyValue(command.valorInicial)
      if (!money.ok) {
        return { ok: false, error: caixaMsgServidor(idioma, 'msg_valor_inicial_invalido'), code: money.code }
      }
      const status = await reader.getStatus(command.operadorId)
      if (status.ok && status.status === 'ABERTO') {
        return {
          ok: false,
          error: caixaMsgServidor(idioma, 'err_srv_caixa_ja_aberto'),
          code: CASH_ERROR_CODES.SESSION_ALREADY_OPEN,
        }
      }
      try {
        const { data: novo, error: insertErr } = await supabase
          .from('caixas')
          .insert({
            operador_id: command.operadorId,
            loja_id: command.lojaId,
            valor_inicial: command.valorInicial,
            saldo_atual: command.valorInicial,
            status: 'ABERTO',
          })
          .select('id')
          .single()
        if (insertErr || !novo) {
          if (insertErr?.message?.includes('uq_caixas_operador_aberto')) {
            return {
              ok: false,
              error: caixaMsgServidor(idioma, 'err_srv_caixa_ja_aberto'),
              code: CASH_ERROR_CODES.SESSION_ALREADY_OPEN,
            }
          }
          return {
            ok: false,
            error: insertErr?.message ?? await caixaMsgOperador('err_srv_concluir'),
            code: CASH_ERROR_CODES.OPEN_FAILED,
          }
        }
        return { ok: true, caixaId: String(novo.id) }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : await caixaMsgOperador('err_srv_concluir'),
          code: CASH_ERROR_CODES.OPEN_FAILED,
        }
      }
    },

    async close(command: CloseCashSessionCommand): Promise<CloseCashSessionResult> {
      const idioma = await idiomaOperadorParaErro()
      const money = validateCashMoneyValue(command.valorContado)
      if (!money.ok) {
        return { ok: false, error: caixaMsgServidor(idioma, 'msg_valor_contado_invalido'), code: money.code }
      }
      const motivo = (command.motivo ?? '').trim()
      const motivoOk = validateCloseMotivo(motivo)
      if (!motivoOk.ok) {
        return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_motivo_longo'), code: motivoOk.code }
      }
      try {
        const { data, error: rpcErr } = await supabase.rpc('fechar_caixa_atomico', {
          p_operador_id: command.operadorId,
          p_valor_contado: command.valorContado,
          p_motivo: motivo,
        })
        if (rpcErr) {
          const msg = rpcErr.message ?? ''
          if (msg.includes('FECHAR_CAIXA_DIVERGENCIA_SEM_MOTIVO')) {
            return {
              ok: false,
              error: msg,
              code: CASH_ERROR_CODES.DIVERGENCE_NEEDS_MOTIVO,
            }
          }
          if (msg.includes('FECHAR_CAIXA_MOVIMENTACOES_PENDENTES')) {
            return {
              ok: false,
              error: msg,
              code: CASH_ERROR_CODES.PENDING_MOVEMENTS,
            }
          }
          if (msg.includes('FECHAR_CAIXA_CAIXA_NAO_ENCONTRADO')) {
            return {
              ok: false,
              error: caixaMsgServidor(idioma, 'err_srv_caixa_sem_aberto'),
              code: CASH_ERROR_CODES.SESSION_NOT_FOUND,
            }
          }
          return { ok: false, error: msg, code: CASH_ERROR_CODES.CLOSE_FAILED }
        }
        const row = (Array.isArray(data) ? data[0] : data) as RpcFecharRow | undefined
        if (!row) {
          return {
            ok: false,
            error: await caixaMsgOperador('err_srv_concluir'),
            code: CASH_ERROR_CODES.CLOSE_FAILED,
          }
        }
        return {
          ok: true,
          caixaId: String(row.o_caixa_id),
          valorSistemaDinheiro: Number(row.o_valor_sistema),
          valorContado: Number(row.o_valor_contado),
          diferenca: Number(row.o_diferenca),
          alreadyClosed: Boolean(row.o_ja_fechado),
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : await caixaMsgOperador('err_srv_concluir'),
          code: CASH_ERROR_CODES.CLOSE_FAILED,
        }
      }
    },
  }
}
