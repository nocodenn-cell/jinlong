import { createClient } from '@/lib/supabase/server'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { mapRegraPrecoRow, type RegraPrecoRow } from '@/core/caixa/mapRegrasPreco'
import { buildRegrasPrecoValidadeOrFilter } from '@/core/caixa/regrasPrecoValidadeFilter'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { DEFAULT_PRICING_CONTEXT } from '@shared/pricing/types'
import { variantesChaveLeitura } from '@/core/caixa/variantesChaveLeitura'
import { mensagemErroDeExcecao, mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import { calcularPrecoProdutoCaixaImpl } from '@/app/caixa/server/caixaPrecoProduto.impl'
import type {
  BuscarProdutoResult,
  BuscarProdutoComPrecoResult,
  CarregarRegrasResult,
} from '@/app/caixa/caixaActionTypes'
import {
  estoqueResumoParaCaixa,
  fetchPdvConfigParaCaixaWeb,
  mapProdutoRow,
  PRODUTO_COLS,
  sanitizeIlikeFragment,
} from '@/app/caixa/server/caixaActionsInternals'

export async function carregarRegrasPrecoCaixaImpl(): Promise<CarregarRegrasResult> {
  try {
    const { userId } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    const supabase = await createClient()

    const [{ data, error }, cfgRes] = await Promise.all([
      supabase
        .from('regras_preco')
        .select(
          'id, tipo_regra, produto_id, categoria_id, quantidade_minima, quantidade_maxima, tipo_desconto, valor_desconto, data_validade, ativo',
        )
        .eq('ativo', true)
        // Regras vencidas não devem ser carregadas/aplicadas (data_validade no passado).
        .or(buildRegrasPrecoValidadeOrFilter()),
      fetchPdvConfigParaCaixaWeb(supabase),
    ])

    if (error) {
      return { ok: false, error: mensagemErroParaUsuario(error.message) }
    }

    if (!cfgRes.ok) {
      return { ok: false, error: cfgRes.error }
    }
    const minAtacado = cfgRes.row?.quantidade_minima_atacado_padrao
      ? Number(cfgRes.row.quantidade_minima_atacado_padrao)
      : DEFAULT_PRICING_CONTEXT.quantidadeMinimaAtacadoPadrao

    const regras = (data as RegraPrecoRow[] | null)?.map(mapRegraPrecoRow) ?? []
    return {
      ok: true,
      regras,
      pricingContext: { quantidadeMinimaAtacadoPadrao: minAtacado },
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível carregar as regras de preço.'),
    }
  }
}

export async function buscarProdutoParaCaixaImpl(termo: string): Promise<BuscarProdutoResult> {
  try {
    const { userId, lojaId: lojaUsuario } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    const supabase = await createClient()

    const lojaId = lojaUsuario ?? LOJA_MATRIZ_ID

    const t = termo.trim()
    if (!t) return { ok: true, status: 'nao_encontrado' }

    const variantes = variantesChaveLeitura(t)
    if (variantes.length > 0) {
      const { data: porCodigoLista, error: errCodigo } = await supabase
        .from('produtos')
        .select(PRODUTO_COLS)
        .eq('ativo', true)
        .in('codigo_barras', variantes)
        .limit(10)

      if (errCodigo) return { ok: false, error: mensagemErroParaUsuario(errCodigo.message) }
      const listaCod = porCodigoLista ?? []
      if (listaCod.length > 0) {
        const ids = new Set(listaCod.map((r) => r.id))
        if (ids.size > 1) {
          return {
            ok: true,
            status: 'ambiguo',
            mensagem:
              'Vários produtos batem com o código lido. Use o nome ou corrija códigos duplicados no cadastro.',
          }
        }
        const row = listaCod[0]
        const est = await estoqueResumoParaCaixa(supabase, row.id, lojaId)
        return {
          ok: true,
          status: 'encontrado',
          produto: mapProdutoRow(row, est.quantidade_atual, est.estoque_minimo),
        }
      }
    }

    const frag = sanitizeIlikeFragment(t)
    if (frag.length < 2) {
      return { ok: true, status: 'nao_encontrado' }
    }

    const { data: porNome, error: errNome } = await supabase
      .from('produtos')
      .select(PRODUTO_COLS)
      .eq('ativo', true)
      .ilike('nome', `%${frag}%`)
      .limit(3)

    if (errNome) return { ok: false, error: mensagemErroParaUsuario(errNome.message) }
    let lista = porNome ?? []

    if (lista.length === 0) {
      const { data: cats, error: errCat } = await supabase
        .from('categorias')
        .select('id')
        .ilike('nome', `%${frag}%`)
        .limit(25)
      if (errCat) return { ok: false, error: mensagemErroParaUsuario(errCat.message) }
      const catIds = (cats ?? []).map((c) => c.id)
      if (catIds.length > 0) {
        const { data: porCat, error: errPorCat } = await supabase
          .from('produtos')
          .select(PRODUTO_COLS)
          .eq('ativo', true)
          .in('categoria_id', catIds)
          .limit(3)
        if (errPorCat) return { ok: false, error: mensagemErroParaUsuario(errPorCat.message) }
        lista = porCat ?? []
      }
    }

    if (lista.length === 0) return { ok: true, status: 'nao_encontrado' }
    if (lista.length > 1) {
      return {
        ok: true,
        status: 'ambiguo',
        mensagem: `Vários produtos batem com “${frag}” (nome ou categoria). Use o código de barras ou refine a busca.`,
      }
    }

    const row = lista[0]
    const est = await estoqueResumoParaCaixa(supabase, row.id, lojaId)
    return {
      ok: true,
      status: 'encontrado',
      produto: mapProdutoRow(row, est.quantidade_atual, est.estoque_minimo),
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível buscar o produto. Tente de novo.'),
    }
  }
}

/**
 * Busca produto + preço autoritativo em 1 round-trip.
 * Elimina a 2ª server action de `calcularPrecoProdutoCaixa` no hot-path de scan.
 * Fallback: se RPC falhar, retorna preco_varejo para não bloquear o carrinho.
 */
export async function buscarProdutoComPrecoCaixaImpl(
  termo: string,
  quantidade: number = 1,
): Promise<BuscarProdutoComPrecoResult> {
  try {
    // Valida quantidade
    const q = Math.max(1, Math.floor(Number(quantidade)))
    if (!Number.isFinite(q)) {
      return { ok: false, error: 'Quantidade inválida.' }
    }

    // Busca produto
    const buscaRes = await buscarProdutoParaCaixaImpl(termo)
    if (!buscaRes.ok) {
      return { ok: false, error: buscaRes.error }
    }
    if (buscaRes.status !== 'encontrado') {
      // Propaga not_found / ambiguous
      return buscaRes as BuscarProdutoComPrecoResult
    }

    const produto = buscaRes.produto

    // Calcula preço autoritativo via RPC
    const precoRes = await calcularPrecoProdutoCaixaImpl({
      produtoId: produto.id,
      quantidade: q,
    })

    // Fallback: se RPC falhar, usa preco_varejo (não bloqueia o item)
    const precoCalculado = precoRes.ok ? precoRes.preco : produto.preco_varejo
    const tipoPrecoCalculado = precoRes.ok ? precoRes.tipo : 'VAREJO'

    return {
      ok: true,
      status: 'encontrado',
      produto,
      precoCalculado,
      tipoPrecoCalculado,
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível buscar o produto. Tente de novo.'),
    }
  }
}
