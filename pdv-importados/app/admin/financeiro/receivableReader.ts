/**
 * Adapter ReceivableReader — ADR-010.
 * Listagem filtrada de contas a receber (sem mutação).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ListLiquidacoesQuery,
  ListLiquidacoesResult,
  ListReceivablesQuery,
  ListReceivablesResult,
  ReceivableListRow,
  ReceivableReader,
} from '@shared-core/src/financial'
import { FINANCIAL_ERROR_CODES, hojeYmd, isTituloVencido } from '@shared-core/src/financial'

/** Neutraliza os curingas de LIKE (`%`, `_`) num termo digitado pelo usuário. */
export function escapeIlike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(s: string): boolean {
  return UUID_RE.test(s)
}

async function resolveIdsByBusca(
  supabase: SupabaseClient,
  qNeedle: string,
): Promise<string[] | null> {
  const needle = qNeedle.trim()
  if (!needle) return null
  const pat = `%${escapeIlike(needle)}%`
  const [{ data: byDesc }, { data: cliQ }] = await Promise.all([
    supabase.from('contas_receber').select('id').ilike('descricao', pat).limit(2000),
    supabase.from('clientes').select('id').ilike('nome', pat).limit(500),
  ])
  const fromCliIds = cliQ?.map((c) => c.id as string) ?? []
  let fromClienteTitulos: { id: string }[] = []
  if (fromCliIds.length > 0) {
    const r = await supabase.from('contas_receber').select('id').in('cliente_id', fromCliIds).limit(2000)
    fromClienteTitulos = r.data ?? []
  }
  const set = new Set<string>()
  for (const r of byDesc ?? []) set.add(r.id as string)
  for (const r of fromClienteTitulos) set.add(r.id as string)
  const ids = [...set]
  if (ids.length === 0) return []
  const MAX_IDS_BUSCA = 1200
  return ids.length > MAX_IDS_BUSCA ? ids.slice(0, MAX_IDS_BUSCA) : ids
}

function mapTitulo(t: Record<string, unknown>, hoje: string): ReceivableListRow {
  const cn = t.clientes as { nome?: string } | { nome?: string }[] | null
  const nomeCliente = Array.isArray(cn) ? cn[0]?.nome : cn?.nome
  const status = String(t.status)
  const vencimento = t.vencimento != null ? String(t.vencimento) : null
  return {
    tituloId: String(t.id),
    clienteId: String(t.cliente_id),
    valorTotal: Number(t.valor_total),
    valorAberto: Number(t.valor_aberto),
    status,
    lojaId: String(t.loja_id),
    descricao: t.descricao != null ? String(t.descricao) : null,
    vencimento,
    clienteNome: nomeCliente ?? null,
    atrasado: isTituloVencido(vencimento, status, hoje),
    vendaId: t.venda_id != null ? String(t.venda_id) : null,
  }
}

export function createReceivableReader(supabase: SupabaseClient): ReceivableReader {
  return {
    async list(query: ListReceivablesQuery): Promise<ListReceivablesResult> {
      try {
        const limite = Math.min(500, Math.max(50, query.limite))
        const take = limite + 1

        const clienteId = query.clienteId.trim()
        if (clienteId && !isUuid(clienteId)) {
          return { ok: true, titulos: [], capped: false }
        }

        const idsPorBusca = await resolveIdsByBusca(supabase, query.q)
        if (idsPorBusca && idsPorBusca.length === 0) {
          return { ok: true, titulos: [], capped: false }
        }

        let q = supabase
          .from('contas_receber')
          .select('id, valor_total, valor_aberto, status, descricao, vencimento, cliente_id, loja_id, venda_id, clientes(nome)')

        if (query.opcao === 'ABERTO') q = q.eq('status', 'ABERTO')
        else if (query.opcao === 'PARCIAL') q = q.eq('status', 'PARCIAL')
        else q = q.in('status', ['ABERTO', 'PARCIAL'])

        if (query.de.trim() && isYmd(query.de)) {
          q = q.not('vencimento', 'is', null).gte('vencimento', query.de.trim())
        }
        if (query.ate.trim() && isYmd(query.ate)) {
          q = q.not('vencimento', 'is', null).lte('vencimento', query.ate.trim())
        }
        if (clienteId) q = q.eq('cliente_id', clienteId)
        if (idsPorBusca) q = q.in('id', idsPorBusca)

        const { data: raw, error } = await q.order('created_at', { ascending: false }).limit(take)
        if (error) {
          return {
            ok: false,
            error: error.message,
            code: FINANCIAL_ERROR_CODES.LIST_FAILED,
          }
        }
        const rows = raw ?? []
        const capped = rows.length > limite
        const sliced = capped ? rows.slice(0, limite) : rows
        const hoje = hojeYmd()
        return {
          ok: true,
          titulos: sliced.map((t) => mapTitulo(t as Record<string, unknown>, hoje)),
          capped,
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Erro ao listar contas a receber.',
          code: FINANCIAL_ERROR_CODES.LIST_FAILED,
        }
      }
    },

    async listLiquidacoes(query: ListLiquidacoesQuery): Promise<ListLiquidacoesResult> {
      try {
        const { data, error } = await supabase
          .from('liquidacoes_receber')
          .select('id, titulo_id, valor, forma_pagamento, created_at, operacao_tipo, operacao_origem_id')
          .eq('titulo_id', query.tituloId)
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) {
          return { ok: false, error: error.message, code: FINANCIAL_ERROR_CODES.LIST_FAILED }
        }
        return {
          ok: true,
          liquidacoes: (data ?? []).map((r) => ({
            id: String(r.id),
            tituloId: String(r.titulo_id),
            valor: Number(r.valor),
            formaPagamento: String(r.forma_pagamento),
            createdAt: String(r.created_at),
            operacaoTipo: (r.operacao_tipo as 'RECEBIMENTO' | 'ESTORNO' | null) ?? null,
            operacaoOrigemId: r.operacao_origem_id != null ? String(r.operacao_origem_id) : null,
          })),
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Erro ao listar liquidações.',
          code: FINANCIAL_ERROR_CODES.LIST_FAILED,
        }
      }
    },
  }
}
