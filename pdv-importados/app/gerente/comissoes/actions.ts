"use server"

import { createClient } from "@/lib/supabase/server"
import { getLojaIdUsuario, LOJA_MATRIZ_ID } from "@/lib/auth/lojaUsuario"

export type ResumoComissaoRow = {
  vendedorId: string
  vendedorNome: string
  totalVendasValor: number
  totalComissao: number
  quantidadeItens: number
  quantidadeVendas: number
}

export type DetalheComissaoItem = {
  vendaId: string
  produtoNome: string
  quantidade: number
  valorComissaoUnitario: number
  valorComissaoTotal: number
  criadoEm: string
}

export async function obterResumoComissoes(
  dataInicio: string,
  dataFim: string,
): Promise<ResumoComissaoRow[]> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return []
    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID
    const { data, error } = await supabase.rpc("obter_resumo_comissoes_vendedores", {
      p_loja_id: lojaId,
      p_data_inicio: dataInicio,
      p_data_fim: dataFim,
    })
    if (error) { return [] }
    return (data ?? []).map((r: Record<string, unknown>) => ({
      vendedorId: String(r.vendedor_id ?? ""),
      vendedorNome: String(r.vendedor_nome ?? ""),
      totalVendasValor: Number(r.total_vendas_valor ?? 0),
      totalComissao: Number(r.total_comissao ?? 0),
      quantidadeItens: Number(r.quantidade_itens ?? 0),
      quantidadeVendas: Number(r.quantidade_vendas ?? 0),
    }))
  } catch {
    return []
  }
}

export async function obterDetalhamentoItens(
  vendedorId: string,
  dataInicio: string,
  dataFim: string,
): Promise<DetalheComissaoItem[]> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return []
    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID
    const { data, error } = await supabase
      .from("comissoes_vendedores")
      .select("venda_id, quantidade, valor_comissao_unitario, valor_comissao_total, criado_em, produtos(nome)")
      .eq("loja_id", lojaId)
      .eq("vendedor_id", vendedorId)
      .gte("criado_em", `${dataInicio}T00:00:00Z`)
      .lte("criado_em", `${dataFim}T23:59:59Z`)
      .order("criado_em", { ascending: false })
    if (error) { return [] }
    return (data ?? []).map((r: Record<string, unknown>) => {
      const prod = r.produtos as Record<string, unknown> | null
      return {
        vendaId: String(r.venda_id ?? ""),
        produtoNome: prod ? String(prod.nome ?? "") : "—",
        quantidade: Number(r.quantidade ?? 0),
        valorComissaoUnitario: Number(r.valor_comissao_unitario ?? 0),
        valorComissaoTotal: Number(r.valor_comissao_total ?? 0),
        criadoEm: String(r.criado_em ?? ""),
      }
    })
  } catch {
    return []
  }
}
