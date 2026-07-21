import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isGtinLookupCandidate,
  isSugestaoConhecida,
  normalizeGtinDigits,
  sugerirPrecoVarejoDeCusto,
  type FonteSugestaoCadastro,
} from '@/core/catalog/sugestaoCadastro'
import type { SugestaoCadastroProduto } from '@/core/ports/gtinLookup'
import { readGtinCache, writeGtinCache } from './gtinCacheRepository'
import {
  buscarProdutoPorGtinLoja,
  buscarViaVinculoNfe,
  listarCategoriasLoja,
  medianaPrecoCategoria,
  resolverCategoriaComPistas,
  sugestaoFromProdutoHit,
} from './historicoInternoLookup'
import { lookupOpenFoodFacts } from './openFoodFactsLookup'

function emptySugestao(gtin: string): SugestaoCadastroProduto {
  return {
    gtin,
    nome: null,
    precoVarejo: null,
    precoCusto: null,
    ncm: null,
    categoriaId: null,
    categoriaNome: null,
    marca: null,
    fontes: ['nenhuma'],
    jaCadastrado: false,
    produtoIdExistente: null,
    knownSuggestion: false,
  }
}

function withKnown(s: SugestaoCadastroProduto): SugestaoCadastroProduto {
  return {
    ...s,
    knownSuggestion: isSugestaoConhecida({
      nome: s.nome,
      precoVarejo: s.precoVarejo,
    }),
  }
}

/**
 * Orquestra: catálogo → vínculo NF-e → cache → Open Food Facts → mediana categoria.
 */
export async function sugerirDadosCadastroPorGtinImpl(
  supabase: SupabaseClient,
  lojaId: string,
  codigoRaw: string,
): Promise<SugestaoCadastroProduto> {
  const gtin = normalizeGtinDigits(codigoRaw) || codigoRaw.trim()
  if (!gtin) return emptySugestao('')

  const categorias = await listarCategoriasLoja(supabase, lojaId)

  const noCatalogo = await buscarProdutoPorGtinLoja(supabase, lojaId, codigoRaw)
  if (noCatalogo) {
    return withKnown(sugestaoFromProdutoHit(gtin, noCatalogo, 'catalogo', categorias))
  }

  const viaVinculo = await buscarViaVinculoNfe(supabase, lojaId, gtin)
  if (viaVinculo) {
    return withKnown(sugestaoFromProdutoHit(gtin, viaVinculo, 'vinculo_nfe', categorias))
  }

  const fontes: FonteSugestaoCadastro[] = []
  let nome: string | null = null
  let ncm: string | null = null
  let marca: string | null = null
  let categoriaExterna: string | null = null
  let precoVarejo: number | null = null
  const precoCusto: number | null = null

  const cached = await readGtinCache(supabase, gtin)
  if (cached) {
    fontes.push('cache')
    nome = cached.nome
    ncm = cached.ncm
    marca = cached.marca
    categoriaExterna = cached.categoriaExterna
  } else if (isGtinLookupCandidate(gtin)) {
    const off = await lookupOpenFoodFacts(gtin)
    if (off) {
      fontes.push('openfoodfacts')
      nome = off.nome
      ncm = off.ncm
      marca = off.marca
      categoriaExterna = off.categoriaExterna
      await writeGtinCache(supabase, off)
    }
  }

  const cat = resolverCategoriaComPistas(categorias, [
    categoriaExterna,
    nome,
    marca,
  ])
  if (cat) {
    const mediana = await medianaPrecoCategoria(supabase, lojaId, cat.id)
    if (mediana != null) {
      precoVarejo = mediana
      fontes.push('categoria_mediana')
    }
  }

  if (precoVarejo == null && precoCusto != null) {
    precoVarejo = sugerirPrecoVarejoDeCusto(precoCusto)
  }

  if (fontes.length === 0) fontes.push('nenhuma')

  return withKnown({
    gtin,
    nome,
    precoVarejo,
    precoCusto,
    ncm,
    categoriaId: cat?.id ?? null,
    categoriaNome: cat?.nome ?? null,
    marca,
    fontes,
    jaCadastrado: false,
    produtoIdExistente: null,
    knownSuggestion: false,
  })
}
