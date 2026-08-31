import { createClient } from '@/lib/supabase/server'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import { mapRegraPrecoRow, type RegraPrecoRow } from '@/core/caixa/mapRegrasPreco'
import { buildRegrasPrecoValidadeOrFilter } from '@/core/caixa/regrasPrecoValidadeFilter'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { DEFAULT_PRICING_CONTEXT } from '@shared/pricing/types'
import { variantesChaveLeitura } from '@/core/caixa/variantesChaveLeitura'
import { mensagemErroDeExcecao, mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import { idiomaOperadorParaErro } from '@/app/caixa/server/caixaErroOperador'
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
} from '@/app/caixa/caixaActionTypes'
import {
  estoqueResumoParaCaixa,
  fetchPdvConfigParaCaixaWeb,
  mapProdutoRow,
  sanitizeIlikeFragment,
  semAcento,
} from '@/app/caixa/server/caixaActionsInternals'

type ProdutoRowCaixa = {
  id: string
  nome: string
  codigo_barras: string | null
  codigo_interno: string | null
  preco_varejo: number | string
  preco_atacado?: number | string | null
  categoria_id: string | null
  origem: OrigemProdutoCaixa
  tem_nf: boolean
  observacao: string | null
  ativo: boolean
  status_publicacao: string | null
}

/**
 * Teto de candidatos mostrados numa ambiguidade por nome/categoria — pequeno o
 * bastante pra caber numa lista escaneável (regra de densidade), grande o
 * bastante pra não cortar silenciosamente um conjunto real pequeno (ex.: 4
 * variações de "Cadeira Vermelha" já passariam do limite antigo de 3).
 */
const LIMITE_CANDIDATOS_AMBIGUOS = 8

/** Resolve estoque de cada candidato em paralelo (N pequeno — mesmo custo do caminho de match único). */
async function montarCandidatos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: ProdutoRowCaixa[],
  lojaId: string,
): Promise<ReturnType<typeof mapProdutoRow>[]> {
  return Promise.all(
    rows.map(async (row) => {
      const est = await estoqueResumoParaCaixa(supabase, row.id, lojaId)
      return mapProdutoRow(row, est.quantidade_atual, est.estoque_minimo)
    }),
  )
}

function rowVendavel(row: ProdutoRowCaixa): boolean {
  return isProdutoVendavel({
    ativo: row.ativo,
    status_publicacao: row.status_publicacao,
  })
}

/**
 * Onda 2 · Bloco 3 — banco ainda sem a migration `nome_sem_acento`
 * (20260831100000, preparada nesta onda mas NÃO aplicada em produção).
 * PostgREST devolve `42703` (undefined_column) se a coluna não existir; sem
 * este fallback, TODA busca por nome no PDV quebraria até a migration rodar.
 * Mesmo padrão já usado pra "RPC ainda não promovida" em productUpdater.ts
 * (`rpcAusente`) — banco desatualizado nunca pode ser um crash, só uma
 * degradação graciosa pro comportamento antigo (accent-sensitive).
 */
function colunaSemAcentoAusente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703') return true
  const msg = error.message ?? ''
  return msg.includes('nome_sem_acento') && (msg.includes('does not exist') || msg.includes('column'))
}

export async function carregarRegrasPrecoCaixaImpl(): Promise<CarregarRegrasResult> {
  try {
    const { userId, idioma } = await getUsuarioAtual()
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
      return { ok: false, error: mensagemErroParaUsuario(error.message, idioma) }
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
      error: mensagemErroDeExcecao(e, 'Não foi possível carregar as regras de preço.', await idiomaOperadorParaErro()),
    }
  }
}

export async function buscarProdutoParaCaixaImpl(termo: string): Promise<BuscarProdutoResult> {
  try {
    const { userId, lojaId: lojaUsuario, idioma } = await getUsuarioAtual()
    if (!userId) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    const supabase = await createClient()

    const lojaId = lojaUsuario ?? LOJA_MATRIZ_ID

    const t = termo.trim()
    if (!t) return { ok: true, status: 'nao_encontrado' }

    const variantes = variantesChaveLeitura(t)
    if (variantes.length > 0) {
      const { data: porCodigoLista, error: errCodigo } = await aplicarFiltroProdutoVendavel(
        supabase.from('produtos').select('*'),
      )
        .in('codigo_barras', variantes)
        .limit(10)

      if (errCodigo) return { ok: false, error: mensagemErroParaUsuario(errCodigo.message, idioma) }
      const listaCod = filtrarSomenteProdutosVendaveis((porCodigoLista ?? []) as ProdutoRowCaixa[])
      if (listaCod.length > 0) {
        const ids = new Set(listaCod.map((r) => r.id))
        if (ids.size > 1) {
          // Sem candidatos de propósito: colisão de código de barras não é uma
          // ambiguidade de nome que o operador resolva visualmente — é sintoma
          // do modelo produto↔loja/tenant (decisão de domínio ainda pendente).
          return {
            ok: true,
            status: 'ambiguo',
            mensagem:
              'Vários produtos batem com o código lido. Use o nome ou corrija códigos duplicados no cadastro.',
            candidatos: [],
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
    const fragSemAcento = semAcento(frag)

    let porNomeRes = await aplicarFiltroProdutoVendavel(supabase.from('produtos').select('*'))
      .ilike('nome_sem_acento', `%${fragSemAcento}%`)
      .order('nome', { ascending: true })
      .limit(LIMITE_CANDIDATOS_AMBIGUOS)

    if (colunaSemAcentoAusente(porNomeRes.error)) {
      porNomeRes = await aplicarFiltroProdutoVendavel(supabase.from('produtos').select('*'))
        .ilike('nome', `%${frag}%`)
        .order('nome', { ascending: true })
        .limit(LIMITE_CANDIDATOS_AMBIGUOS)
    }
    const { data: porNome, error: errNome } = porNomeRes

    if (errNome) return { ok: false, error: mensagemErroParaUsuario(errNome.message, idioma) }
    let lista = filtrarSomenteProdutosVendaveis((porNome ?? []) as ProdutoRowCaixa[])

    if (lista.length === 0) {
      let catsRes = await supabase
        .from('categorias')
        .select('id')
        .ilike('nome_sem_acento', `%${fragSemAcento}%`)
        .limit(25)
      if (colunaSemAcentoAusente(catsRes.error)) {
        catsRes = await supabase.from('categorias').select('id').ilike('nome', `%${frag}%`).limit(25)
      }
      const { data: cats, error: errCat } = catsRes
      if (errCat) return { ok: false, error: mensagemErroParaUsuario(errCat.message, idioma) }
      const catIds = (cats ?? []).map((c) => c.id)
      if (catIds.length > 0) {
        const { data: porCat, error: errPorCat } = await aplicarFiltroProdutoVendavel(
          supabase.from('produtos').select('*'),
        )
          .in('categoria_id', catIds)
          .order('nome', { ascending: true })
          .limit(LIMITE_CANDIDATOS_AMBIGUOS)
        if (errPorCat) return { ok: false, error: mensagemErroParaUsuario(errPorCat.message, idioma) }
        lista = filtrarSomenteProdutosVendaveis((porCat ?? []) as ProdutoRowCaixa[])
      }
    }

    if (lista.length === 0) return { ok: true, status: 'nao_encontrado' }
    if (lista.length > 1) {
      const candidatos = await montarCandidatos(supabase, lista, lojaId)
      return {
        ok: true,
        status: 'ambiguo',
        mensagem: `Vários produtos batem com “${frag}” (nome ou categoria). Escolha um da lista ou refine a busca.`,
        candidatos,
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
      error: mensagemErroDeExcecao(e, 'Não foi possível buscar o produto. Tente de novo.', await idiomaOperadorParaErro()),
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
      error: mensagemErroDeExcecao(e, 'Não foi possível buscar o produto. Tente de novo.', await idiomaOperadorParaErro()),
    }
  }
}
