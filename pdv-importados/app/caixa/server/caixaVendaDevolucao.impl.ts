import { createClient } from '@/lib/supabase/server'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { mensagemErroDeExcecao, mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import { devolverOuTrocarVendaImpl } from '@/app/gerente/vendas/devolverOuTrocarVenda.impl'
import type { DevolverVendaInput } from '@/app/gerente/vendas/parseDevolverVendaForm'
import type { VendaDetalhe } from '@/app/admin/vendas/actions'

/**
 * Fase 5, Entrega 2 — devolução acessível direto do caixa (não só do painel de
 * gerente). Reusa a mesma RPC/impl já autorizados (`devolverOuTrocarVendaImpl`,
 * único caller autorizado da RPC de devolução — ver rpc-gate-guard.mjs); a
 * diferença é o escopo de leitura (venda do próprio operador) e a origem do
 * gerenteToken (autorização pontual, não sessão de gerente).
 */

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

export type VendaDetalheParaDevolucaoResult =
  | { ok: true; venda: VendaDetalhe }
  | { ok: false; error: string }

/** Detalhe (header + itens) de uma venda CONCLUIDA do próprio operador, para devolução no caixa. */
export async function obterVendaDetalheParaDevolucaoCaixaImpl(
  vendaId: string,
): Promise<VendaDetalheParaDevolucaoResult> {
  const id = vendaId.trim()
  if (!id) return { ok: false, error: 'Venda inválida.' }

  try {
    const { userId } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const supabase = await createClient()

    const { data: venda, error } = await supabase
      .from('vendas')
      .select(
        `
        id, data, total_bruto, total_desconto, total_liquido,
        forma_pagamento, tipo_venda, status, numero_nf,
        operador:usuarios!vendas_operador_id_fkey ( nome )
      `,
      )
      .eq('id', id)
      .eq('operador_id', userId)
      .maybeSingle()

    if (error || !venda) return { ok: false, error: 'Venda não encontrada.' }
    if (String(venda.status) !== 'CONCLUIDA') {
      return { ok: false, error: 'Só é possível devolver vendas concluídas.' }
    }

    const { data: itensRaw, error: itensError } = await supabase
      .from('itens_venda')
      .select(
        `
        id, quantidade, preco_unitario, preco_unitario_original, desconto_unitario,
        tipo_preco, custo_unitario_snap,
        produto:produtos!itens_venda_produto_id_fkey ( nome, codigo_barras )
      `,
      )
      .eq('venda_id', id)
      .order('id')

    if (itensError) return { ok: false, error: mensagemErroParaUsuario(itensError.message) }

    const itemIds = (itensRaw ?? []).map((r) => String(r.id))
    const devolvidoPorItem = new Map<string, number>()

    if (itemIds.length > 0) {
      const { data: devolvidos } = await supabase
        .from('venda_pos_venda_itens')
        .select('item_venda_id, quantidade')
        .in('item_venda_id', itemIds)

      for (const row of devolvidos ?? []) {
        const itemId = String(row.item_venda_id)
        const atual = devolvidoPorItem.get(itemId) ?? 0
        devolvidoPorItem.set(itemId, atual + Number(row.quantidade ?? 0))
      }
    }

    const { data: crRow } = await supabase
      .from('contas_receber')
      .select('valor_aberto, status')
      .eq('venda_id', id)
      .in('status', ['ABERTO', 'PARCIAL'])
      .maybeSingle()

    const temContaReceber = !!crRow
    const valorAbertoCr = Number(crRow?.valor_aberto ?? 0)

    const itens = (itensRaw ?? []).map((r) => {
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
      ok: true,
      venda: {
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
        tem_conta_receber: temContaReceber,
        valor_aberto_cr: valorAbertoCr,
        itens,
        showMargemVisual: false,
        showPrecoFonte: false,
      },
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível carregar a venda para devolução.'),
    }
  }
}

export type DevolverVendaCaixaResult =
  | { ok: true; operacaoId: string; valorEstornado: number }
  | { ok: false; error: string }

/** Devolve/troca uma venda do próprio operador a partir do caixa. */
export async function devolverVendaCaixaImpl(
  input: DevolverVendaInput,
): Promise<DevolverVendaCaixaResult> {
  const result = await devolverOuTrocarVendaImpl(input)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, operacaoId: result.operacaoId, valorEstornado: result.valorEstornado }
}
