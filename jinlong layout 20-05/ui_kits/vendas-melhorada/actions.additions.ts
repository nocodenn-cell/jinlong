/**
 * Adicione esta função ao arquivo existente
 *   pdv-importados/app/gerente/vendas/actions.ts
 *
 * Ela busca o detalhe completo da venda (cabeçalho + itens + nome do operador)
 * e é chamada pelo VendaDetalheModal logo após abrir.
 *
 * Espelha a query da página de detalhe (`[id]/page.tsx`), mas retorna um DTO
 * simples para o client.
 */

'use server'

import { createClient } from '@/lib/supabase/server'

export type VendaDetalheDTO = {
  venda: {
    id: string
    data: string | null
    total_bruto: number
    total_desconto: number
    total_liquido: number
    forma_pagamento: string | null
    tipo_venda: string | null
    status: string | null
    caixa_id: string | null
    operador_id: string | null
    operador_nome: string | null
    numero_nf: string | null
  }
  itens: Array<{
    id: string
    quantidade: number
    preco_unitario: number
    preco_unitario_original: number | null
    desconto_unitario: number
    tipo_preco: string | null
    produto_nome: string | null
    produto_codigo: string | null
  }>
}

export async function buscarVendaDetalheAction(
  id: string,
): Promise<{ ok: true; detalhe: VendaDetalheDTO } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()

    const { data: venda, error: vendaErr } = await supabase
      .from('vendas')
      .select(
        `
        id, data, total_bruto, total_desconto, total_liquido,
        forma_pagamento, tipo_venda, status, caixa_id, operador_id, numero_nf,
        operador:usuarios!vendas_operador_id_fkey ( nome )
      `,
      )
      .eq('id', id)
      .maybeSingle()

    if (vendaErr) return { ok: false, error: vendaErr.message }
    if (!venda) return { ok: false, error: 'Venda não encontrada.' }

    const operadorNome =
      venda.operador && typeof venda.operador === 'object' && 'nome' in venda.operador
        ? String((venda.operador as { nome: string }).nome)
        : null

    const { data: itens, error: itensErr } = await supabase
      .from('itens_venda')
      .select(
        `
        id, quantidade, preco_unitario, preco_unitario_original,
        desconto_unitario, tipo_preco,
        produto:produtos!itens_venda_produto_id_fkey ( nome, codigo_barras )
      `,
      )
      .eq('venda_id', id)
      .order('id')

    if (itensErr) return { ok: false, error: itensErr.message }

    return {
      ok: true,
      detalhe: {
        venda: {
          id: String(venda.id),
          data: venda.data as string | null,
          total_bruto: Number(venda.total_bruto ?? 0),
          total_desconto: Number(venda.total_desconto ?? 0),
          total_liquido: Number(venda.total_liquido ?? 0),
          forma_pagamento: (venda.forma_pagamento as string | null) ?? null,
          tipo_venda: (venda.tipo_venda as string | null) ?? null,
          status: (venda.status as string | null) ?? null,
          caixa_id: (venda.caixa_id as string | null) ?? null,
          operador_id: (venda.operador_id as string | null) ?? null,
          operador_nome: operadorNome,
          numero_nf: (venda.numero_nf as string | null) ?? null,
        },
        itens: (itens ?? []).map((row) => {
          const p = row.produto
          const produtoNome =
            p && typeof p === 'object' && 'nome' in p ? String((p as { nome: string }).nome) : null
          const produtoCodigo =
            p && typeof p === 'object' && 'codigo_barras' in p
              ? (p as { codigo_barras: string | null }).codigo_barras
              : null
          return {
            id: String(row.id),
            quantidade: Number(row.quantidade ?? 0),
            preco_unitario: Number(row.preco_unitario ?? 0),
            preco_unitario_original:
              row.preco_unitario_original != null ? Number(row.preco_unitario_original) : null,
            desconto_unitario: Number(row.desconto_unitario ?? 0),
            tipo_preco: (row.tipo_preco as string | null) ?? null,
            produto_nome: produtoNome,
            produto_codigo: produtoCodigo,
          }
        }),
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao buscar detalhe da venda.' }
  }
}
