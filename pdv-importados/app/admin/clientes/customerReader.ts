import type { SupabaseClient } from '@supabase/supabase-js'
import { hojeYmd } from '@shared-core/src/financial'
import type {
  ClienteListRow,
  ClienteTipo,
  CustomerByIdResult,
  CustomerReader,
  CustomerReaderById,
  ListClientesPaginadosQuery,
  ListClientesPaginadosResult,
} from '@shared-core/src/customers'
import { clienteIdsComTituloVencido, type TituloAbertoCliente } from './clienteListaFiltro'

export type AdminCustomerReader = CustomerReader & CustomerReaderById

/** Mesmo page size da action legada (`gerente/clientes/actions.ts`). */
export const CLIENTES_PAGE_SIZE = 20

const VIEW_COLS =
  'id, nome, tipo, documento, email, telefone, endereco, limite_credito, saldo_crediario, ultima_compra, created_at'

type ClienteViewRow = {
  id: string
  nome: string
  tipo: ClienteTipo
  documento: string
  email: string | null
  telefone: string | null
  endereco: string | null
  limite_credito: number | string | null
  saldo_crediario: number | string | null
  ultima_compra: string | null
  created_at: string | null
}

/** Mapeia linha da view `v_clientes_gerente` → DTO de domínio. */
export function mapClienteViewRow(r: ClienteViewRow): ClienteListRow {
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    documento: r.documento,
    email: r.email,
    telefone: r.telefone,
    endereco: r.endereco,
    limite_crediario: Number(r.limite_credito ?? 0),
    saldo_crediario: Number(r.saldo_crediario ?? 0),
    ultima_compra: r.ultima_compra ?? null,
    criado_em: r.created_at ?? null,
  }
}

function buildSearchOrFilter(termo: string): string {
  const t = termo.trim()
  const onlyDigits = t.replace(/\D/g, '')
  const ors = [`nome.ilike.%${t}%`, `email.ilike.%${t}%`]
  if (onlyDigits) {
    ors.push(`documento.like.%${onlyDigits}%`, `telefone.like.%${onlyDigits}%`)
  }
  return ors.join(',')
}

function slicePage(rows: ClienteListRow[]): { clientes: ClienteListRow[]; hasMore: boolean } {
  const hasMore = rows.length > CLIENTES_PAGE_SIZE
  return { clientes: hasMore ? rows.slice(0, CLIENTES_PAGE_SIZE) : rows, hasMore }
}

/**
 * Adapter de leitura — `CustomerReader` + `CustomerReaderById` (Fase 2/5.1g).
 * Mutações: Writer (create); update/exclusão ainda em `gerente/clientes`.
 */
export function createCustomerReader(supabase: SupabaseClient): AdminCustomerReader {
  return {
    async listPaginados(query: ListClientesPaginadosQuery): Promise<ListClientesPaginadosResult> {
      try {
        const atraso = await idsSeAtraso(supabase, query)
        if (!atraso.ok) return { ok: false, error: atraso.error }
        if (atraso.vazio) return { ok: true, clientes: [], hasMore: false }
        return await paginaClientes(supabase, query, atraso.ids)
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Erro ao buscar clientes.',
        }
      }
    },

    async getById(id: string): Promise<CustomerByIdResult> {
      try {
        const { data, error } = await supabase
          .from('v_clientes_gerente')
          .select(VIEW_COLS)
          .eq('id', id)
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, cliente: mapClienteViewRow(data as ClienteViewRow) }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Erro ao buscar clientes.',
        }
      }
    },
  }
}

type AtrasoLookup =
  | { ok: true; ids: string[] | null; vazio: boolean }
  | { ok: false; error: string }

async function idsSeAtraso(
  supabase: SupabaseClient,
  query: ListClientesPaginadosQuery,
): Promise<AtrasoLookup> {
  if (query.situacao !== 'atraso') return { ok: true, ids: null, vazio: false }
  const hoje = hojeYmd()
  const { data, error } = await supabase
    .from('contas_receber')
    .select('cliente_id, vencimento, status')
    .in('status', ['ABERTO', 'PARCIAL'])
    .not('vencimento', 'is', null)
    .lt('vencimento', hoje)
    .limit(1000)
  if (error) return { ok: false, error: error.message }
  const ids = clienteIdsComTituloVencido((data ?? []) as TituloAbertoCliente[], hoje)
  return { ok: true, ids, vazio: ids.length === 0 }
}

async function paginaClientes(
  supabase: SupabaseClient,
  query: ListClientesPaginadosQuery,
  idsAtraso: string[] | null,
): Promise<ListClientesPaginadosResult> {
  const from = (query.page - 1) * CLIENTES_PAGE_SIZE
  const to = from + CLIENTES_PAGE_SIZE
  let qb = supabase
    .from('v_clientes_gerente')
    .select(VIEW_COLS)
    .order('nome', { ascending: true })
    .range(from, to)
  qb = aplicarFiltrosLista(qb, query, idsAtraso)
  const { data, error } = await qb
  if (error) return { ok: false, error: error.message }
  const rows = ((data ?? []) as ClienteViewRow[]).map(mapClienteViewRow)
  return { ok: true, ...slicePage(rows) }
}

type FiltroLista = {
  eq: (coluna: string, valor: string) => FiltroLista
  gt: (coluna: string, valor: number) => FiltroLista
  in: (coluna: string, valores: string[]) => FiltroLista
  or: (filtro: string) => FiltroLista
}

function aplicarFiltrosLista<T>(qb: T, query: ListClientesPaginadosQuery, idsAtraso: string[] | null): T {
  let next = qb as FiltroLista
  if (query.tipo) next = next.eq('tipo', query.tipo)
  if (query.situacao === 'aberto') next = next.gt('saldo_crediario', 0)
  if (idsAtraso) next = next.in('id', idsAtraso)
  const termo = query.termo?.trim()
  if (termo) next = next.or(buildSearchOrFilter(termo))
  return next as T
}
