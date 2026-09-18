/**
 * UX-04 — leitura do resumo de recebimento de um pedido (pedido/recebido/pendente).
 *
 * Fora de `'use server'` de propósito: é helper interno das actions de entrada
 * (NF-e, entrada sem nota, recebimento do pedido), não um endpoint. Somente leitura, sempre
 * com escopo de loja; o estado em si é decidido pelo banco (RPCs), aqui só se lê o resultado.
 */

import type { createClient } from '@/lib/supabase/server'
import { totaisRecebimento, type OcResumoRecebimento } from './ocRecebimento'

type Supabase = Awaited<ReturnType<typeof createClient>>

export async function carregarResumoOc(
  supabase: Supabase,
  lojaId: string,
  ocId: string,
): Promise<OcResumoRecebimento | null> {
  const { data, error } = await supabase
    .from('ordens_compra')
    .select('id, status, encerrada_com_falta_em, itens:ordens_compra_itens(quantidade, quantidade_recebida)')
    .eq('id', ocId)
    .eq('loja_id', lojaId)
    .maybeSingle()
  if (error || !data) return null

  const itens = ((data as { itens?: Array<{ quantidade: number; quantidade_recebida: number }> }).itens ?? []).map((i) => ({
    quantidade: Number(i.quantidade),
    quantidade_recebida: Number(i.quantidade_recebida),
  }))
  const t = totaisRecebimento(itens)
  const status = String((data as { status?: string }).status ?? '')
  return {
    oc_id: ocId,
    status,
    ...t,
    encerrada: status === 'RECEBIDA',
    encerrada_com_falta: (data as { encerrada_com_falta_em?: string | null }).encerrada_com_falta_em != null,
  }
}

export type OcSaldoItem = {
  item_id: string
  produto_id: string | null
  nome: string
  pedido: number
  recebido: number
  saldo: number
}

export type OcSaldoDetalhe = {
  resumo: OcResumoRecebimento
  fornecedor_nome: string | null
  itens: OcSaldoItem[]
}

/** Pedido com saldo por item (para a NF-e mostrar o que o pedido ainda espera). */
export async function carregarSaldoOcItens(
  supabase: Supabase,
  lojaId: string,
  ocId: string,
): Promise<OcSaldoDetalhe | null> {
  const { data, error } = await supabase
    .from('ordens_compra')
    .select(
      'id, status, fornecedor_nome, encerrada_com_falta_em, fornecedor:fornecedores!fornecedor_id(nome), itens:ordens_compra_itens(id, produto_id, descricao, quantidade, quantidade_recebida, produto:produtos!produto_id(nome))',
    )
    .eq('id', ocId)
    .eq('loja_id', lojaId)
    .maybeSingle()
  if (error || !data) return null

  type Row = {
    status: string
    fornecedor_nome: string | null
    encerrada_com_falta_em: string | null
    fornecedor: { nome: string } | null
    itens: Array<{
      id: string
      produto_id: string | null
      descricao: string | null
      quantidade: number
      quantidade_recebida: number
      produto: { nome: string } | null
    }> | null
  }
  const row = data as unknown as Row
  const itens: OcSaldoItem[] = (row.itens ?? []).map((i) => ({
    item_id: i.id,
    produto_id: i.produto_id,
    nome: i.produto?.nome ?? i.descricao ?? '—',
    pedido: Number(i.quantidade),
    recebido: Number(i.quantidade_recebida),
    saldo: Math.max(Math.round((Number(i.quantidade) - Number(i.quantidade_recebida)) * 1000) / 1000, 0),
  }))
  const t = totaisRecebimento(itens.map((i) => ({ quantidade: i.pedido, quantidade_recebida: i.recebido })))
  return {
    resumo: {
      oc_id: ocId,
      status: row.status,
      ...t,
      encerrada: row.status === 'RECEBIDA',
      encerrada_com_falta: row.encerrada_com_falta_em != null,
    },
    fornecedor_nome: row.fornecedor?.nome ?? row.fornecedor_nome ?? null,
    itens,
  }
}

/** Quanto uma NF-e efetivamente abateu de pedidos (razão por item). */
export async function somaAtribuidaImportacao(
  supabase: Supabase,
  lojaId: string,
  importacaoId: string,
): Promise<number> {
  const { data } = await supabase
    .from('ordens_compra_recebimentos')
    .select('quantidade')
    .eq('importacao_nfe_id', importacaoId)
    .eq('loja_id', lojaId)
  return (data ?? []).reduce((s, r) => s + Number((r as { quantidade: number }).quantidade), 0)
}
