import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ClienteListRow,
  ClienteTipo,
  CustomerByIdResult,
  CustomerReader,
  CustomerReaderById,
  ListClientesPaginadosQuery,
  ListClientesPaginadosResult,
} from '@shared-core/src/customers'

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
        const from = (query.page - 1) * CLIENTES_PAGE_SIZE
        const to = from + CLIENTES_PAGE_SIZE

        let qb = supabase
          .from('v_clientes_gerente')
          .select(VIEW_COLS)
          .order('nome', { ascending: true })
          .range(from, to)

        const termo = query.termo?.trim()
        if (termo) qb = qb.or(buildSearchOrFilter(termo))

        const { data, error } = await qb
        if (error) return { ok: false, error: error.message }

        const rows = ((data ?? []) as ClienteViewRow[]).map(mapClienteViewRow)
        return { ok: true, ...slicePage(rows) }
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
