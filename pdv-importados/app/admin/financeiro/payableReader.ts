/**
 * Adapter PayableReader — ADR-010.
 * Listagem tipada de contas a pagar (sem mutação).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ListPayablesQuery,
  ListPayablesResult,
  PayableReader,
  PayableTitle,
} from '@shared-core/src/financial'
import { FINANCIAL_ERROR_CODES, hojeYmd, isTituloVencido } from '@shared-core/src/financial'

export const PAYABLES_PAGE_SIZE = 20

const COLUMNS = `
  id, fornecedor_id, favorecido, descricao, valor_total, valor_pago, vencimento,
  status, nfe_numero, nfe_importacao_id, criado_em, loja_id,
  fornecedor:fornecedores!contas_pagar_fornecedor_id_fkey ( nome )
`

function mapPayable(raw: Record<string, unknown>, hoje: string): PayableTitle {
  const forn = raw.fornecedor
  const fornecedorNome =
    forn && typeof forn === 'object' && 'nome' in forn
      ? String((forn as { nome: string }).nome)
      : null
  const vencimento = (raw.vencimento as string | null) ?? null
  const status = String(raw.status ?? 'PENDENTE').toUpperCase()
  return {
    contaId: String(raw.id),
    fornecedorId: String(raw.fornecedor_id),
    fornecedorNome,
    descricao: String(raw.descricao ?? ''),
    valorTotal: Number(raw.valor_total ?? 0),
    valorPago: Number(raw.valor_pago ?? 0),
    vencimento,
    status,
    nfeNumero: (raw.nfe_numero as string | null) ?? null,
    nfeImportacaoId: (raw.nfe_importacao_id as string | null) ?? null,
    criadoEm: (raw.criado_em as string | null) ?? null,
    lojaId: String(raw.loja_id),
    atrasado: isTituloVencido(vencimento, status, hoje),
  }
}

export function createPayableReader(supabase: SupabaseClient): PayableReader {
  return {
    async list(query: ListPayablesQuery): Promise<ListPayablesResult> {
      try {
        const from = (query.page - 1) * PAYABLES_PAGE_SIZE
        const to = from + PAYABLES_PAGE_SIZE

        let qb = payableTable(supabase)
          .select(COLUMNS)
          .order('vencimento', { ascending: true, nullsFirst: false })
          .range(from, to)

        const hoje = hojeYmd()
        if (query.status === 'atrasado') {
          // 'ATRASADO' é um valor de CHECK legado que nenhum writer grava
          // (item 13 do Plano Mestre) — "atrasado" é sempre computado por
          // vencimento < hoje sobre status em aberto, nunca por igualdade
          // de status.
          qb = qb.in('status', ['PENDENTE', 'PARCIAL', 'ATRASADO']).lt('vencimento', hoje)
        } else if (query.status && query.status !== 'todos') {
          qb = qb.eq('status', query.status.toUpperCase())
        }
        if (query.fornecedorId) {
          qb = qb.eq('fornecedor_id', query.fornecedorId)
        }
        if (query.periodo) {
          const [y, mo] = query.periodo.split('-').map(Number)
          if (y && mo) {
            const start = new Date(Date.UTC(y, mo - 1, 1)).toISOString()
            const end = new Date(Date.UTC(y, mo, 1)).toISOString()
            qb = qb.gte('vencimento', start).lt('vencimento', end)
          }
        }
        if (query.termo?.trim()) {
          const t = query.termo.trim()
          qb = qb.or(`descricao.ilike.%${t}%,nfe_numero.ilike.%${t}%`)
        }

        const { data, error } = await qb
        if (error) {
          return {
            ok: false,
            error: error.message,
            code: FINANCIAL_ERROR_CODES.LIST_FAILED,
          }
        }
        const rows = (data ?? []).map((r) => mapPayable(r as Record<string, unknown>, hoje))
        const hasMore = rows.length > PAYABLES_PAGE_SIZE
        return {
          ok: true,
          contas: hasMore ? rows.slice(0, PAYABLES_PAGE_SIZE) : rows,
          hasMore,
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Erro ao buscar contas a pagar.',
          code: FINANCIAL_ERROR_CODES.LIST_FAILED,
        }
      }
    },
  }
}

function payableTable(supabase: SupabaseClient) {
  return supabase.from('contas_pagar')
}

export function readPayablePayments(supabase: SupabaseClient, contaId: string, lojaId: string) {
  return supabase.from('contas_pagar_pagamentos')
    .select('id, valor, forma_pagamento, data_pagamento, operacao_tipo, conta:contas_pagar!inner(loja_id)')
    .eq('conta_id', contaId).eq('conta.loja_id', lojaId)
    .order('data_pagamento', { ascending: false }).limit(100)
}

export function readNfePayables(supabase: SupabaseClient, lojaId: string) {
  return payableTable(supabase)
    .select('nfe_importacao_id, valor_total, valor_pago, vencimento, fornecedor_id, status')
    .eq('loja_id', lojaId)
    .neq('status', 'CANCELADO')
}
