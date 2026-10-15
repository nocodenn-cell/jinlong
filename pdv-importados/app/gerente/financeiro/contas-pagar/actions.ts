'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import { createPayablePaymentService } from '@/app/admin/financeiro/payablePayment'
import { createPayableReader, readPayablePayments } from '@/app/admin/financeiro/payableReader'
import type { FormaPagamentoPagar, PayableTitle } from '@shared-core/src/financial'
import { hojeYmd, isTituloVencido } from '@shared-core/src/financial'

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
  loja_id: string
  /** Computado na leitura (vencimento < hoje, status em aberto) — ver item 13 do Plano Mestre. */
  atrasado: boolean
}

/** Fonte única: `shared-core/src/financial/types` (`FormaPagamentoPagar`). */
export type FormaPagamento = FormaPagamentoPagar

export type PagamentoContaRow = { id: string; valor: number; forma: string; data: string; tipo: string }

export async function listarPagamentosContaAction(contaId: string): Promise<
  { ok: true; pagamentos: PagamentoContaRow[] } | { ok: false; error: string }
> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }
  if (!auth.session.lojaId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contaId)) return { ok: false, error: 'Conta ou loja inválida.' }
  try {
    const { data, error } = await readPayablePayments(await createClient(), contaId, auth.session.lojaId)
    if (error) return { ok: false, error: mensagemErroComSecao('Histórico de pagamentos', error.message) }
    return { ok: true, pagamentos: (data ?? []).map((p) => ({
      id: p.id, valor: Number(p.valor), forma: p.forma_pagamento, data: p.data_pagamento,
      tipo: p.operacao_tipo ?? 'PAGAMENTO',
    })) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Não foi possível carregar os pagamentos.' }
  }
}

const COLUMNS = `
  id, fornecedor_id, favorecido, descricao, valor_total, valor_pago, vencimento,
  status, nfe_numero, nfe_importacao_id, criado_em, loja_id,
  fornecedor:fornecedores!contas_pagar_fornecedor_id_fkey ( nome )
`

function mapRow(raw: Record<string, unknown>): ContaPagarRow {
  const forn = raw.fornecedor
  const fornecedor_nome =
    forn && typeof forn === 'object' && 'nome' in forn ? String((forn as { nome: string }).nome) : null
  const vencimento = (raw.vencimento as string | null) ?? null
  const status = String(raw.status ?? 'PENDENTE').toUpperCase() as ContaPagarStatus
  return {
    id: String(raw.id),
    fornecedor_id: String(raw.fornecedor_id),
    fornecedor_nome,
    descricao: String(raw.descricao ?? ''),
    valor_total: Number(raw.valor_total ?? 0),
    valor_pago: Number(raw.valor_pago ?? 0),
    vencimento,
    status,
    nfe_numero: (raw.nfe_numero as string | null) ?? null,
    nfe_importacao_id: (raw.nfe_importacao_id as string | null) ?? null,
    criado_em: (raw.criado_em as string | null) ?? null,
    loja_id: String(raw.loja_id),
    atrasado: isTituloVencido(vencimento, status, hojeYmd()),
  }
}

function payableToRow(p: PayableTitle): ContaPagarRow {
  return {
    id: p.contaId,
    fornecedor_id: p.fornecedorId,
    fornecedor_nome: p.fornecedorNome,
    descricao: p.descricao,
    valor_total: p.valorTotal,
    valor_pago: p.valorPago,
    vencimento: p.vencimento,
    status: p.status.toUpperCase() as ContaPagarStatus,
    nfe_numero: p.nfeNumero,
    nfe_importacao_id: p.nfeImportacaoId,
    criado_em: p.criadoEm,
    loja_id: p.lojaId,
    atrasado: p.atrasado,
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
  // Server Action é invocável por POST em qualquer rota (fora do matcher do middleware):
  // o guard próprio não depende do edge; a RLS continua sendo a última barreira.
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }
  try {
    const supabase = await createClient()
    const reader = createPayableReader(supabase)
    const listed = await reader.list({
      page,
      status: filters?.status,
      fornecedorId: filters?.fornecedor_id,
      periodo: filters?.periodo,
      termo: filters?.termo,
    })
    if (!listed.ok) return { ok: false, error: listed.error }
    return {
      ok: true,
      contas: listed.contas.map(payableToRow),
      hasMore: listed.hasMore,
    }
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
  idempotency_key: string
  caixa_id?: string | null
  autorizacao_token?: string | null
}

export async function buscarCaixasAbertosPagamentoAction(lojaId: string): Promise<
  { ok: true; caixas: Array<{ id: string; operador: string }> } | { ok: false; error: string }
> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('caixas')
    .select('id, usuarios!caixas_operador_id_fkey(nome)')
    .eq('loja_id', lojaId)
    .eq('status', 'ABERTO')
  if (error) return { ok: false, error: error.message }
  return {
    ok: true,
    caixas: (data ?? []).map((c) => ({
      id: c.id,
      operador: (c.usuarios as { nome?: string } | null)?.nome ?? c.id.slice(0, 8),
    })),
  }
}

export async function registrarPagamentoAction(
  input: RegistrarPagamentoInput,
): Promise<
  | { ok: true; conta: ContaPagarRow; movimentacaoCaixaId: string | null }
  | { ok: false; error: string }
> {
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
      idempotencyKey: input.idempotency_key,
      caixaId: input.caixa_id,
      autorizacaoToken: input.autorizacao_token,
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
    return {
      ok: true,
      conta: mapRow(data as Record<string, unknown>),
      // G-09: já calculado pelo backend (RPC registrar_pagamento_contas_pagar
      // via payablePayment.ts) mas antes descartado aqui — nulo para
      // pagamento não-DINHEIRO (não mexe na gaveta).
      movimentacaoCaixaId: paid.movimentacaoCaixaId,
    }
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
    // Cancelar uma conta é idempotente por natureza — só existe um cancelamento
    // por título. A chave determinística faz retry de qualquer cliente convergir
    // para o mesmo comando, e os estornos derivados herdam esse escopo.
    const cancelled = await payment.cancel({
      contaId: conta_id,
      motivo,
      idempotencyKey: `cancel:${conta_id}`,
    })
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
