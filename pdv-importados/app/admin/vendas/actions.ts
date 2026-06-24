'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertAdminSession } from '@/lib/admin/auth/assertAdminSession'
import { ROUTES } from '@shared-core/navigation/routes'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type VendaItemDetalhe = Readonly<{
  id: string
  nome: string
  codigo_barras: string | null
  quantidade: number
  preco_unitario: number
  preco_unitario_original: number
  desconto_unitario: number
  subtotal: number
  tipo_preco: string | null
  tipo_preco_fonte: string | null
  custo_unitario_snap: number | null
  regra_aplicada_id: string | null
}>

export type VendaDetalhe = Readonly<{
  id: string
  data: string | null
  total_bruto: number
  total_desconto: number
  total_liquido: number
  forma_pagamento: string | null
  tipo_venda: string | null
  status: string | null
  numero_nf: string | null
  operador_nome: string | null
  itens: VendaItemDetalhe[]
  showMargemVisual: boolean
  showPrecoFonte: boolean
}>

function nomeRelacao(rel: unknown, campo: string): string | null {
  if (rel && typeof rel === 'object' && campo in rel) {
    const v = (rel as Record<string, unknown>)[campo]
    return v == null ? null : String(v)
  }
  if (Array.isArray(rel) && rel[0] && typeof rel[0] === 'object' && campo in rel[0]) {
    const v = (rel[0] as Record<string, unknown>)[campo]
    return v == null ? null : String(v)
  }
  return null
}

/**
 * Detalhe de uma venda (header + itens) na loja do usuário logado (via RLS).
 * Read-only; retorna null se inválida/não encontrada (o Sheet mostra o erro).
 */
export async function obterDetalheVenda(vendaId: string): Promise<VendaDetalhe | null> {
  if (!UUID_RE.test(vendaId)) return null

  const auth = await assertAdminSession('vendas:detalhe', {
    pathname: ROUTES.admin.vendas,
    resource: `route:${ROUTES.admin.vendas}`,
  })
  if (!auth.ok) return null

  const supabase = await createClient()

  const { data: venda, error } = await supabase
    .from('vendas')
    .select(
      `
      id, data, total_bruto, total_desconto, total_liquido,
      forma_pagamento, tipo_venda, status, numero_nf,
      operador:usuarios!vendas_operador_id_fkey ( nome )
    `
    )
    .eq('id', vendaId)
    .maybeSingle()

  if (error || !venda) return null

  const { data: itensRaw, error: itensError } = await supabase
    .from('itens_venda')
    .select(
      `
      id, quantidade, preco_unitario, preco_unitario_original, desconto_unitario,
      tipo_preco, custo_unitario_snap,
      produto:produtos!itens_venda_produto_id_fkey ( nome, codigo_barras )
    `
    )
    .eq('venda_id', vendaId)
    .order('id')

  if (itensError) return null

  const itens: VendaItemDetalhe[] = (itensRaw ?? []).map((r) => {
    const q = Number(r.quantidade ?? 0)
    const pu = Number(r.preco_unitario ?? 0)
    return {
      id: String(r.id),
      nome: nomeRelacao(r.produto, 'nome') ?? '—',
      codigo_barras: nomeRelacao(r.produto, 'codigo_barras'),
      quantidade: q,
      preco_unitario: pu,
      preco_unitario_original: Number(r.preco_unitario_original ?? pu),
      desconto_unitario: Number(r.desconto_unitario ?? 0),
      subtotal: q * pu,
      tipo_preco: r.tipo_preco == null ? null : String(r.tipo_preco),
      tipo_preco_fonte: null,
      custo_unitario_snap: r.custo_unitario_snap == null ? null : Number(r.custo_unitario_snap),
      regra_aplicada_id: null,
    }
  })

  return {
    id: String(venda.id),
    data: venda.data == null ? null : String(venda.data),
    total_bruto: Number(venda.total_bruto ?? 0),
    total_desconto: Number(venda.total_desconto ?? 0),
    total_liquido: Number(venda.total_liquido ?? 0),
    forma_pagamento: venda.forma_pagamento == null ? null : String(venda.forma_pagamento),
    tipo_venda: venda.tipo_venda == null ? null : String(venda.tipo_venda),
    status: venda.status == null ? null : String(venda.status),
    numero_nf: venda.numero_nf == null ? null : String(venda.numero_nf),
    operador_nome: nomeRelacao(venda.operador, 'nome'),
    itens,
    showMargemVisual: false,
    showPrecoFonte: false,
  }
}

type R = { success: true } | { success: false; error: string }

export type FormaDevolucao =
  | 'DINHEIRO'
  | 'PIX'
  | 'CARTAO_DEBITO'
  | 'CARTAO_CREDITO'

export type SaldoDevolvivel = {
  status: string
  total_liquido: number
  total_devolvido: number
  saldo_devolvivel: number
}

export async function obterSaldoDevolvivel(
  venda_id: string,
): Promise<{ success: true; data: SaldoDevolvivel } | { success: false; error: string }> {
  if (!UUID_RE.test(venda_id)) return { success: false, error: 'Venda inválida.' }

  const auth = await assertAdminSession('vendas:devolucao-saldo', {
    pathname: ROUTES.admin.vendas,
    resource: `route:${ROUTES.admin.vendas}`,
  })
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()

  const { data: venda } = await supabase
    .from('vendas')
    .select('total_liquido, status')
    .eq('id', venda_id)
    .maybeSingle()

  if (!venda) return { success: false, error: 'Venda não encontrada.' }

  const { data: devolvidos } = await supabase
    .from('devolucoes')
    .select('valor')
    .eq('venda_id', venda_id)

  const total_devolvido = (devolvidos ?? []).reduce((sum, d) => sum + Number(d.valor), 0)
  const total_liquido = Number(venda.total_liquido ?? 0)

  return {
    success: true,
    data: {
      status: String(venda.status ?? ''),
      total_liquido,
      total_devolvido,
      saldo_devolvivel: Math.max(0, total_liquido - total_devolvido),
    },
  }
}

export async function registrarDevolucao(input: {
  venda_id: string
  valor: number
  forma_pagamento: FormaDevolucao
  motivo: string
}): Promise<R> {
  if (!UUID_RE.test(input.venda_id)) return { success: false, error: 'Venda inválida' }
  if (!input.valor || input.valor <= 0) return { success: false, error: 'Valor deve ser maior que zero' }
  if (!input.motivo.trim()) return { success: false, error: 'Motivo obrigatório' }

  const auth = await assertAdminSession('vendas:devolucao', {
    pathname: ROUTES.admin.vendas,
    resource: `route:${ROUTES.admin.vendas}`,
  })
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()

  const { data: venda } = await supabase
    .from('vendas')
    .select('total_liquido, status')
    .eq('id', input.venda_id)
    .maybeSingle()

  if (!venda) return { success: false, error: 'Venda não encontrada.' }
  if (String(venda.status ?? '').toUpperCase() !== 'CONCLUIDA') {
    return { success: false, error: 'Devolução permitida apenas para vendas concluídas.' }
  }

  const { data: devolvidos } = await supabase
    .from('devolucoes')
    .select('valor')
    .eq('venda_id', input.venda_id)

  const total_devolvido = (devolvidos ?? []).reduce((sum, d) => sum + Number(d.valor), 0)
  const saldo_devolvivel = Number(venda.total_liquido ?? 0) - total_devolvido

  if (input.valor > saldo_devolvivel + 0.005) {
    return { success: false, error: 'Valor solicitado excede o saldo disponível para devolução.' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Sessão inválida' }

  const { error } = await supabase.from('devolucoes').insert({
    venda_id: input.venda_id,
    valor: input.valor,
    forma_pagamento: input.forma_pagamento,
    motivo: input.motivo.trim(),
    operador_id: user.id,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath(ROUTES.admin.vendas)
  return { success: true }
}
