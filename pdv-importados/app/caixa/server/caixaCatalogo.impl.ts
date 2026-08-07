import { createClient } from '@/lib/supabase/server'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { mapRegraPrecoRow, type RegraPrecoRow } from '@/core/caixa/mapRegrasPreco'
import { buildRegrasPrecoValidadeOrFilter } from '@/core/caixa/regrasPrecoValidadeFilter'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { DEFAULT_PRICING_CONTEXT } from '@shared/pricing/types'
import { variantesChaveLeitura } from '@/core/caixa/variantesChaveLeitura'
import { mensagemErroDeExcecao, mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import {
  aplicarFiltroProdutoVendavel,
  filtrarSomenteProdutosVendaveis,
  isProdutoVendavel,
  primeiroProdutoVendavel,
} from '@/lib/catalog/aplicarFiltroProdutoVendavel'
import { calcularPrecoProdutoCaixaImpl } from '@/app/caixa/server/caixaPrecoProduto.impl'
import { quantidadeParaRpcPreco } from '@/lib/format/quantidadeCaixa'
import type {
  BuscarProdutoResult,
  BuscarProdutoComPrecoResult,
  CarregarRegrasResult,
  OrigemProdutoCaixa,
  ProdutoCaixaResumoDTO,
} from '@/app/caixa/caixaActionTypes'
import {
  estoqueResumoLoteParaCaixa,
  estoqueResumoParaCaixa,
  fetchPdvConfigParaCaixaWeb,
  mapProdutoRow,
  sanitizeIlikeFragment,
} from '@/app/caixa/server/caixaActionsInternals'

/** Teto de candidatos devolvidos ao operador para escolha manual. */
const MAX_CANDIDATOS_BUSCA = 8

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ProdutoRowCaixa = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number | string
  preco_atacado?: number | string | null
  categoria_id: string | null
  origem: OrigemProdutoCaixa
  tem_nf: boolean
  observacao: string | null
  ativo: boolean
  status_publicacao: string | null
}

function rowVendavel(row: ProdutoRowCaixa): boolean {
  return isProdutoVendavel({
    ativo: row.ativo,
    status_publicacao: row.status_publicacao,
  })
}

/**
 * Monta a lista de candidatos para escolha do operador, com estoque resolvido
 * em 1 query (`estoqueResumoLoteParaCaixa`) em vez de uma por produto.
 */
async function montarCandidatos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: readonly ProdutoRowCaixa[],
  lojaId: string,
): Promise<ProdutoCaixaResumoDTO[]> {
  const limitadas = rows.slice(0, MAX_CANDIDATOS_BUSCA)
  const estoquePorProduto = await estoqueResumoLoteParaCaixa(
    supabase,
    limitadas.map((r) => r.id),
    lojaId,
  )
  return limitadas.map((r) => {
    const est = estoquePorProduto.get(r.id)
    return {
      id: r.id,
      nome: r.nome,
      codigo_barras: r.codigo_barras,
      preco_varejo: Number(r.preco_varejo),
      quantidade_estoque: est?.quantidade_atual ?? null,
      estoque_minimo: est?.estoque_minimo ?? null,
    }
  })
}

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

    /**
     * Chave de leitura por id: é assim que o operador confirma a escolha feita
     * na lista de candidatos (`status: 'multiplos'`). Mantém UM caminho de
     * entrada no carrinho — a escolha reentra pelo mesmo pipeline de leitura,
     * preservando rollback, guard de cupom e telemetria.
     *
     * Seguro por construção: um `codigo_barras` (EAN/UPC/GTIN) nunca tem o
     * formato UUID, então este ramo não sequestra leitura de scanner.
     */
    if (UUID_RE.test(t)) {
      const { data: porId, error: errId } = await aplicarFiltroProdutoVendavel(
        supabase.from('produtos').select('*'),
      )
        .eq('id', t)
        .limit(1)

      if (errId) return { ok: false, error: mensagemErroParaUsuario(errId.message) }
      const row = ((porId ?? []) as ProdutoRowCaixa[])[0]
      if (!row || !rowVendavel(row)) {
        return { ok: true, status: 'nao_encontrado' }
      }
      const est = await estoqueResumoParaCaixa(supabase, row.id, lojaId)
      return {
        ok: true,
        status: 'encontrado',
        produto: mapProdutoRow(row, est.quantidade_atual, est.estoque_minimo),
      }
    }

    const variantes = variantesChaveLeitura(t)
    if (variantes.length > 0) {
      const { data: porCodigoLista, error: errCodigo } = await aplicarFiltroProdutoVendavel(
        supabase.from('produtos').select('*'),
      )
        .in('codigo_barras', variantes)
        .limit(10)

      if (errCodigo) return { ok: false, error: mensagemErroParaUsuario(errCodigo.message) }
      const listaCod = filtrarSomenteProdutosVendaveis((porCodigoLista ?? []) as ProdutoRowCaixa[])
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
        if (!rowVendavel(row)) {
          return { ok: true, status: 'nao_encontrado' }
        }
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

    const { data: porNome, error: errNome } = await aplicarFiltroProdutoVendavel(
      supabase.from('produtos').select('*'),
    )
      .ilike('nome', `%${frag}%`)
      .limit(MAX_CANDIDATOS_BUSCA)

    if (errNome) return { ok: false, error: mensagemErroParaUsuario(errNome.message) }
    let lista = filtrarSomenteProdutosVendaveis((porNome ?? []) as ProdutoRowCaixa[])

    if (lista.length === 0) {
      const { data: cats, error: errCat } = await supabase
        .from('categorias')
        .select('id')
        .ilike('nome', `%${frag}%`)
        .limit(25)
      if (errCat) return { ok: false, error: mensagemErroParaUsuario(errCat.message) }
      const catIds = (cats ?? []).map((c) => c.id)
      if (catIds.length > 0) {
        const { data: porCat, error: errPorCat } = await aplicarFiltroProdutoVendavel(
          supabase.from('produtos').select('*'),
        )
          .in('categoria_id', catIds)
          .limit(MAX_CANDIDATOS_BUSCA)
        if (errPorCat) return { ok: false, error: mensagemErroParaUsuario(errPorCat.message) }
        lista = filtrarSomenteProdutosVendaveis((porCat ?? []) as ProdutoRowCaixa[])
      }
    }

    if (lista.length === 0) return { ok: true, status: 'nao_encontrado' }
    if (lista.length > 1) {
      // Busca por nome/categoria com vários acertos é operação normal de balcão,
      // não erro: devolve os candidatos para o operador escolher.
      return {
        ok: true,
        status: 'multiplos',
        produtos: await montarCandidatos(supabase, lista, lojaId),
      }
    }

    const row = primeiroProdutoVendavel(lista)
    if (!row || !rowVendavel(row)) {
      return { ok: true, status: 'nao_encontrado' }
    }
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
    if (quantidadeParaRpcPreco(quantidade) < 1) {
      return { ok: false, error: 'Quantidade inválida.' }
    }

    const buscaRes = await buscarProdutoParaCaixaImpl(termo)
    if (!buscaRes.ok) {
      return { ok: false, error: buscaRes.error }
    }
    if (buscaRes.status !== 'encontrado') {
      return buscaRes as BuscarProdutoComPrecoResult
    }

    const produto = buscaRes.produto

    const precoRes = await calcularPrecoProdutoCaixaImpl({
      produtoId: produto.id,
      quantidade,
    })

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
