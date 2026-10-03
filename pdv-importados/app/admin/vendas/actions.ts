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
import { ROUTES } from '@/lib/navigation/routes'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

import type { VendaDetalhe, VendaItemDetalhe } from '@/lib/caixa/vendaDetalheTypes'

export type { VendaDetalhe, VendaItemDetalhe }

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
      operador:usuarios!vendas_operador_id_fkey ( nome ),
      cliente:clientes!vendas_cliente_id_fkey ( nome )
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

  const itemIds = (itensRaw ?? []).map((r) => String(r.id))
  const devolvidoPorItem = new Map<string, number>()

  if (itemIds.length > 0) {
    const { data: devolvidos } = await supabase
      .from('venda_pos_venda_itens')
      .select('item_venda_id, quantidade')
      .in('item_venda_id', itemIds)

    for (const row of devolvidos ?? []) {
      const id = String(row.item_venda_id)
      const atual = devolvidoPorItem.get(id) ?? 0
      devolvidoPorItem.set(id, atual + Number(row.quantidade ?? 0))
    }
  }

  const { data: crRow } = await supabase
    .from('contas_receber')
    .select('valor_aberto, status')
    .eq('venda_id', vendaId)
    .in('status', ['ABERTO', 'PARCIAL'])
    .maybeSingle()

  // Dados do cupom (2ª via): mesmas tabelas que o histórico do caixa lê; RLS por loja/perfil.
  const [{ data: pagRaw }, { data: descRow }] = await Promise.all([
    supabase.from('vendas_pagamentos').select('forma_pagamento, valor').eq('venda_id', vendaId),
    supabase
      .from('descontos_venda')
      .select('desconto_percentual, desconto_valor')
      .eq('venda_id', vendaId)
      .maybeSingle(),
  ])
  const pagamentos = (pagRaw ?? []).map((p) => ({
    forma_pagamento: String(p.forma_pagamento ?? ''),
    valor: Number(p.valor ?? 0),
  }))

  // Cancelamento: tabela de auditoria já existente (1 linha por venda cancelada; RLS por loja).
  let cancelamento: VendaDetalhe['cancelamento'] = null
  if (String(venda.status ?? '').toUpperCase() === 'CANCELADA') {
    const { data: aud } = await supabase
      .from('vendas_canceladas_auditoria')
      .select(
        `created_at, motivo, valor_estornado,
         operador:usuarios!vendas_canceladas_auditoria_operador_id_fkey ( nome )`,
      )
      .eq('venda_id', vendaId)
      .maybeSingle()
    if (aud) {
      cancelamento = {
        em: aud.created_at == null ? null : String(aud.created_at),
        motivo: aud.motivo == null ? null : String(aud.motivo),
        operador_nome: nomeRelacao(aud.operador, 'nome'),
        valor_estornado: Number(aud.valor_estornado ?? 0),
      }
    }
  }

  const temContaReceber = !!crRow
  const valorAbertoCr = Number(crRow?.valor_aberto ?? 0)

  const itens: VendaItemDetalhe[] = (itensRaw ?? []).map((r) => {
    const q = Number(r.quantidade ?? 0)
    const pu = Number(r.preco_unitario ?? 0)
    const itemId = String(r.id)
    return {
      id: itemId,
      nome: nomeRelacao(r.produto, 'nome') ?? '—',
      codigo_barras: nomeRelacao(r.produto, 'codigo_barras'),
      quantidade: q,
      quantidade_devolvida: devolvidoPorItem.get(itemId) ?? 0,
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
    cliente_nome: nomeRelacao(venda.cliente, 'nome'),
    tem_conta_receber: temContaReceber,
    valor_aberto_cr: valorAbertoCr,
    pagamentos,
    desconto_gerente_valor: Number(descRow?.desconto_valor ?? 0) || 0,
    desconto_gerente_percentual: Number(descRow?.desconto_percentual ?? 0) || 0,
    itens,
    cancelamento,
    showMargemVisual: false,
    showPrecoFonte: false,
  }
}
