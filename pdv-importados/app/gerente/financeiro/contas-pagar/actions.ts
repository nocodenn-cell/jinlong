'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { createPayablePaymentService } from '@/app/admin/financeiro/payablePayment'

export type ContaPagarStatus = 'PENDENTE' | 'PARCIAL' | 'PAGO' | 'ATRASADO' | 'CANCELADO'

export type ContaPagarRow = {
  id: string
  fornecedor_id: string
  fornecedor_nome: string | null
  descricao: string
  valor_total: number
  valor_pago: number
  vencimento: string | null
  status: ContaPagarStatus
  nfe_numero: string | null
  nfe_importacao_id: string | null
  criado_em: string | null
}

export type FormaPagamento = 'DINHEIRO' | 'PIX' | 'CARTAO' | 'BOLETO' | 'TRANSF'

const PAGE_SIZE = 20

const COLUMNS = `
  id, fornecedor_id, descricao, valor_total, valor_pago, vencimento,
  status, nfe_numero, nfe_importacao_id, criado_em,
  fornecedor:fornecedores!contas_pagar_fornecedor_id_fkey ( nome )
`

function mapRow(raw: Record<string, unknown>): ContaPagarRow {
  const forn = raw.fornecedor
  const fornecedor_nome =
    forn && typeof forn === 'object' && 'nome' in forn ? String((forn as { nome: string }).nome) : null
  return {
    id: String(raw.id),
    fornecedor_id: String(raw.fornecedor_id),
    fornecedor_nome,
    descricao: String(raw.descricao ?? ''),
    valor_total: Number(raw.valor_total ?? 0),
    valor_pago: Number(raw.valor_pago ?? 0),
    vencimento: (raw.vencimento as string | null) ?? null,
    status: String(raw.status ?? 'PENDENTE').toUpperCase() as ContaPagarStatus,
    nfe_numero: (raw.nfe_numero as string | null) ?? null,
    nfe_importacao_id: (raw.nfe_importacao_id as string | null) ?? null,
    criado_em: (raw.criado_em as string | null) ?? null,
  }
}

export type ContasPagarFilters = {
  status?: string // 'todos' | 'pendente' | 'parcial' | 'atrasado' | 'pago' | 'cancelado'
  fornecedor_id?: string
  periodo?: string // 'YYYY-MM' (mês de vencimento)
  termo?: string
}

export async function buscarContasPagarAction(
  page: number,
  filters?: ContasPagarFilters,
): Promise<
  { ok: true; contas: ContaPagarRow[]; hasMore: boolean } | { ok: false; error: string }
> {
  try {
    const supabase = await createClient()
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE

    let query = supabase
      .from('contas_pagar')
      .select(COLUMNS)
      .order('vencimento', { ascending: true, nullsFirst: false })
      .range(from, to)

    if (filters?.status && filters.status !== 'todos') {
      query = query.eq('status', filters.status.toUpperCase())
    }
    if (filters?.fornecedor_id) {
      query = query.eq('fornecedor_id', filters.fornecedor_id)
    }
    if (filters?.periodo) {
      // 'YYYY-MM' → janela do mês
      const [y, mo] = filters.periodo.split('-').map(Number)
      if (y && mo) {
        const start = new Date(Date.UTC(y, mo - 1, 1)).toISOString()
        const end = new Date(Date.UTC(y, mo, 1)).toISOString()
        query = query.gte('vencimento', start).lt('vencimento', end)
      }
    }
    if (filters?.termo && filters.termo.trim()) {
      const t = filters.termo.trim()
      query = query.or(`descricao.ilike.%${t}%,nfe_numero.ilike.%${t}%`)
    }

    const { data, error } = await query
    if (error) return { ok: false, error: error.message }
    const rows = (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
    const hasMore = rows.length > PAGE_SIZE
    return { ok: true, contas: hasMore ? rows.slice(0, PAGE_SIZE) : rows, hasMore }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao buscar contas a pagar.' }
  }
}

export type RegistrarPagamentoInput = {
  conta_id: string
  valor: number
  forma: FormaPagamento
  data: string // ISO
  observacao?: string | null
}

export async function registrarPagamentoAction(
  input: RegistrarPagamentoInput,
): Promise<{ ok: true; conta: ContaPagarRow } | { ok: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  if (!input.conta_id?.trim()) return { ok: false, error: 'Conta obrigatória.' }
  if (!input.valor || input.valor <= 0) return { ok: false, error: 'Valor deve ser maior que zero.' }
  if (!input.data) return { ok: false, error: 'Informe a data do pagamento.' }
  if (new Date(input.data).getTime() > Date.now() + 86400000) {
    return { ok: false, error: 'A data do pagamento não pode ser futura.' }
  }

  try {
    const supabase = await createClient()
    const payment = createPayablePaymentService(supabase)
    const paid = await payment.pay({
      contaId: input.conta_id,
      valor: input.valor,
      formaPagamento: input.forma,
      data: input.data,
      observacao: input.observacao ?? null,
    })
    if (!paid.ok) {
      return { ok: false, error: mensagemErroComSecao('Pagamento', paid.error) }
    }

    const { data, error } = await supabase
      .from('contas_pagar')
      .select(COLUMNS)
      .eq('id', input.conta_id)
      .maybeSingle()
    if (error || !data) {
      return { ok: false, error: error?.message ?? 'Conta não encontrada após o pagamento.' }
    }

    revalidatePath('/gerente/financeiro/contas-pagar')
    revalidatePath('/admin/financeiro')
    return { ok: true, conta: mapRow(data as Record<string, unknown>) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao registrar pagamento.' }
  }
}

export async function cancelarContaPagarAction(
  conta_id: string,
  motivo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!conta_id?.trim()) return { ok: false, error: 'Conta obrigatória.' }
  if (!motivo?.trim() || motivo.trim().length < 2) {
    return { ok: false, error: 'Motivo do cancelamento é obrigatório.' }
  }

  try {
    const supabase = await createClient()
    const payment = createPayablePaymentService(supabase)
    const cancelled = await payment.cancel({ contaId: conta_id, motivo })
    if (!cancelled.ok) {
      return { ok: false, error: mensagemErroComSecao('Conta a pagar', cancelled.error) }
    }
    revalidatePath('/gerente/financeiro/contas-pagar')
    revalidatePath('/admin/financeiro')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao cancelar.' }
  }
}

/** Exporta TODAS as linhas que batem nos filtros (paginação em chunks). */
export async function exportarContasPagarParaCSVAction(
  filters: ContasPagarFilters,
): Promise<{ ok: true; rows: ContaPagarRow[] } | { ok: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  const CHUNK = 500
  const MAX = 10_000
  const acc: ContaPagarRow[] = []
  let page = 1
  while (acc.length < MAX) {
    const r = await buscarContasPagarAction(page, filters)
    if (!r.ok) return { ok: false, error: r.error }
    acc.push(...r.contas)
    if (!r.hasMore || r.contas.length < CHUNK) break
    page++
  }
  return { ok: true, rows: acc }
}
