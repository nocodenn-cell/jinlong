'use server'

/**
 * FastProduct Admin — Vendas (Fase 5) · actions
 *
 * A LISTAGEM reusa a action EXISTENTE `buscarVendasPaginadasAction`
 * (`@/app/gerente/vendas/actions`) — nenhuma query nova para a lista.
 *
 * A ÚNICA action nova é o DETALHE de uma venda, porque o detalhe do gerente vive
 * inline em `vendas/[id]/page.tsx` (não há action reutilizável). É READ-ONLY e
 * não altera schema — só lê `vendas` + `itens_venda`. Versão "lean": header +
 * itens (sem movimentos de caixa / baixas de estoque, que ficam em /gerente).
 */

import { createClient } from '@/lib/supabase/server'
import { assertAdminSession } from '@/lib/admin/auth/assertAdminSession'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type VendaItemDetalhe = Readonly<{
  id: string
  nome: string
  codigo_barras: string | null
  quantidade: number
  preco_unitario: number
  desconto_unitario: number
  subtotal: number
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
    pathname: '/admin/vendas',
    resource: 'route:/admin/vendas',
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

  const { data: itensRaw } = await supabase
    .from('itens_venda')
    .select(
      `
      id, quantidade, preco_unitario, desconto_unitario,
      produto:produtos!itens_venda_produto_id_fkey ( nome, codigo_barras )
    `
    )
    .eq('venda_id', vendaId)
    .order('id')

  const itens: VendaItemDetalhe[] = (itensRaw ?? []).map((r) => {
    const q = Number(r.quantidade ?? 0)
    const pu = Number(r.preco_unitario ?? 0)
    return {
      id: String(r.id),
      nome: nomeRelacao(r.produto, 'nome') ?? '—',
      codigo_barras: nomeRelacao(r.produto, 'codigo_barras'),
      quantidade: q,
      preco_unitario: pu,
      desconto_unitario: Number(r.desconto_unitario ?? 0),
      subtotal: q * pu,
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
  }
}
