import { createClient } from '@/lib/supabase/server'
import type { ItemAutoritativo } from '@/app/caixa/server/caixaPrecoAutoritativoServer'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/** Margem unitária negativa em relação ao custo já capturado (migration 235). */
const LIMITE_MARGEM_NEGATIVA = 0

/** Desconto unitário acima de 50% do preço de referência é considerado fora do padrão. */
const LIMITE_DESCONTO_FORA_PADRAO = 0.5

/**
 * Detecção de anomalias leves, explícita no backend (sem trigger/job): roda
 * dentro do fluxo de finalização de venda já existente, com `if` direto sobre
 * dados já calculados pela revalidação de preço. Execução determinística
 * (aguardada pelo chamador) — o try/catch é isolado aqui dentro: qualquer
 * falha na escrita do alerta nunca propaga para a venda, já concluída antes
 * desta chamada.
 */
export async function registrarAlertasLevesVenda(
  supabase: SupabaseServerClient,
  vendaId: string,
  lojaId: string,
  itens: ItemAutoritativo[],
): Promise<void> {
  try {
    const { data: flagsRows } = await supabase.rpc('pdv_config_flags_visuais')
    const flags = Array.isArray(flagsRows) ? flagsRows[0] : flagsRows
    if (!flags?.alertas_leves_ativos) return

    for (const item of itens) {
      if (item.custoUnitarioSnap != null && item.precoUnitario < item.custoUnitarioSnap - LIMITE_MARGEM_NEGATIVA) {
        await supabase.rpc('registrar_system_alert', {
          p_tipo: 'margem_negativa',
          p_produto_id: item.produtoId,
          p_venda_id: vendaId,
          p_detalhe: {
            preco_unitario: item.precoUnitario,
            custo_unitario_snap: item.custoUnitarioSnap,
          },
        })
      }

      if (
        item.precoOriginal > 0 &&
        item.descontoUnitario / item.precoOriginal > LIMITE_DESCONTO_FORA_PADRAO
      ) {
        await supabase.rpc('registrar_system_alert', {
          p_tipo: 'preco_fora_padrao',
          p_produto_id: item.produtoId,
          p_venda_id: vendaId,
          p_detalhe: {
            preco_original: item.precoOriginal,
            preco_unitario: item.precoUnitario,
            desconto_unitario: item.descontoUnitario,
          },
        })
      }
    }

    const produtoIds = Array.from(new Set(itens.map((i) => i.produtoId)))
    const { data: estoqueRows } = await supabase
      .from('estoque')
      .select('produto_id, quantidade_atual')
      .eq('loja_id', lojaId)
      .in('produto_id', produtoIds)

    for (const row of estoqueRows ?? []) {
      const quantidadeAtual = Number(row.quantidade_atual)
      if (Number.isFinite(quantidadeAtual) && quantidadeAtual < 0) {
        await supabase.rpc('registrar_system_alert', {
          p_tipo: 'estoque_inconsistente',
          p_produto_id: row.produto_id,
          p_venda_id: vendaId,
          p_loja_id: lojaId,
          p_detalhe: { quantidade_atual: quantidadeAtual },
        })
      }
    }
  } catch {
    // Best-effort: a venda já foi concluída antes desta chamada — uma falha
    // na detecção de anomalias nunca pode voltar a afetar o fluxo de venda.
  }
}
