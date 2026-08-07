import { createClient } from '@/lib/supabase/server'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroDeExcecao } from '@/lib/errors/mensagemErroUsuario'
import { buscarProdutoComPrecoCaixaImpl } from '@/app/caixa/server/caixaCatalogo.impl'
import { obterConfiguracoesParaCaixaWebImpl } from '@/app/caixa/server/caixaConfiguracoes.impl'
import {
  aplicarFiltroProdutoVendavel,
  isProdutoVendavel,
} from '@/lib/catalog/aplicarFiltroProdutoVendavel'
import type { ConsultaRapidaResult } from '@/app/caixa/caixaActionTypes'

/**
 * Consulta rápida (F3): preço + estoque + última venda/compra + margem opcional.
 * Reusa busca+preço do scan; enriquece com metadados read-only.
 */
export async function consultarProdutoRapidoCaixaImpl(
  termo: string,
): Promise<ConsultaRapidaResult> {
  try {
    const { userId, lojaId: lojaUsuario } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const busca = await buscarProdutoComPrecoCaixaImpl(termo, 1)
    if (!busca.ok) return { ok: false, error: busca.error }
    if (busca.status !== 'encontrado') {
      if (busca.status === 'ambiguo') {
        return { ok: true, status: 'ambiguo', mensagem: busca.mensagem }
      }
      // A consulta rápida ainda não tem seletor próprio (previsto para a Onda 3).
      // Até lá, vários acertos mantêm o comportamento anterior: orienta a refinar.
      // Sem este ramo, `multiplos` cairia em `nao_encontrado` — mentira para o operador.
      if (busca.status === 'multiplos') {
        return {
          ok: true,
          status: 'ambiguo',
          mensagem: `${busca.produtos.length} produtos batem com a busca. Refine o termo ou use o código de barras.`,
        }
      }
      return { ok: true, status: 'nao_encontrado' }
    }

    const lojaId = lojaUsuario ?? LOJA_MATRIZ_ID
    const supabase = await createClient()
    const produtoId = busca.produto.id

    const [itensRes, compraRes, cfgRes, custoRes] = await Promise.all([
      supabase.from('itens_venda').select('venda_id').eq('produto_id', produtoId).limit(30),
      supabase
        .from('v_kardex_unificado')
        .select('ocorrido_em')
        .eq('produto_id', produtoId)
        .eq('loja_id', lojaId)
        .gt('quantidade_delta', 0)
        .order('ocorrido_em', { ascending: false })
        .limit(1)
        .maybeSingle(),
      obterConfiguracoesParaCaixaWebImpl(),
      aplicarFiltroProdutoVendavel(
        supabase
          .from('produtos')
          .select('preco_custo, ativo, status_publicacao')
          .eq('id', produtoId),
      ).maybeSingle(),
    ])

    const custoRow = custoRes.data
    if (
      !custoRow ||
      !isProdutoVendavel({
        ativo: Boolean(custoRow.ativo),
        status_publicacao: custoRow.status_publicacao ?? null,
      })
    ) {
      return { ok: true, status: 'nao_encontrado' }
    }

    let ultimaVendaEm: string | null = null
    const vendaIds = [...new Set((itensRes.data ?? []).map((r) => String(r.venda_id)))]
    if (vendaIds.length > 0) {
      const { data: vendas } = await supabase
        .from('vendas')
        .select('data, status, caixas!inner(loja_id)')
        .in('id', vendaIds)
        .eq('status', 'CONCLUIDA')
        .eq('caixas.loja_id', lojaId)
        .order('data', { ascending: false })
        .limit(1)
      if (vendas?.[0]?.data) ultimaVendaEm = String(vendas[0].data)
    }

    const mostrarMargem =
      cfgRes.ok &&
      (cfgRes.mapa.show_margin_visual === 'true' ||
        cfgRes.mapa.show_margin_visual === '1' ||
        cfgRes.mapa.show_margin_visual === 'TRUE')

    const custoRaw = custoRow.preco_custo
    const custo =
      custoRaw == null || custoRaw === undefined ? null : Number(custoRaw)
    const preco = busca.precoCalculado
    let margemPercentual: number | null = null
    if (mostrarMargem && custo != null && Number.isFinite(custo) && preco > 0) {
      margemPercentual = Math.round(((preco - custo) / preco) * 10000) / 100
    }

    const ultimaCompraEm =
      typeof compraRes.data?.ocorrido_em === 'string' ? compraRes.data.ocorrido_em : null

    return {
      ok: true,
      status: 'encontrado',
      produto: {
        id: produtoId,
        nome: busca.produto.nome,
        codigo_barras: busca.produto.codigo_barras,
        precoCalculado: preco,
        tipoPreco: busca.tipoPrecoCalculado,
        quantidade_estoque: busca.produto.quantidade_estoque,
        estoque_minimo: busca.produto.estoque_minimo,
        ultimaVendaEm,
        ultimaCompraEm,
        margemPercentual,
        mostrarMargem,
      },
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível consultar o produto.'),
    }
  }
}
