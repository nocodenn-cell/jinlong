import type { SupabaseClient } from '@supabase/supabase-js'
import { variantesChaveLeitura } from '@/core/caixa/variantesChaveLeitura'
import {
  medianaPrecos,
  sugerirCategoriaId,
  sugerirPrecoVarejoDeCusto,
} from '@/core/catalog/sugestaoCadastro'
import type { SugestaoCadastroProduto } from '@/core/ports/gtinLookup'
import { anexarCustosProdutos } from '@/lib/gerente/produtos/custosProdutos'

type ProdutoHit = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number | string
  preco_custo: number | string | null
  ncm: string | null
  categoria_id: string | null
}

type CategoriaRow = { id: string; nome: string }

/** N1: o custo não é legível em `produtos`; vem da view gerencial (nulo para quem não tem permissão). */
async function comCusto(
  supabase: SupabaseClient,
  hit: Omit<ProdutoHit, 'preco_custo'> | null,
): Promise<ProdutoHit | null> {
  if (!hit) return null
  const [h] = await anexarCustosProdutos(supabase, [hit])
  return h as unknown as ProdutoHit
}

export async function buscarProdutoPorGtinLoja(
  supabase: SupabaseClient,
  lojaId: string,
  codigo: string,
): Promise<ProdutoHit | null> {
  const variantes = variantesChaveLeitura(codigo).slice(0, 12)
  if (variantes.length === 0) return null
  const { data } = await supabase
    .from('produtos')
    .select('id, nome, codigo_barras, preco_varejo, ncm, categoria_id')
    .eq('loja_id', lojaId)
    .in('codigo_barras', variantes)
    .limit(1)
    .maybeSingle()
  return comCusto(supabase, data as Omit<ProdutoHit, 'preco_custo'> | null)
}

export async function buscarViaVinculoNfe(
  supabase: SupabaseClient,
  lojaId: string,
  gtinDigits: string,
): Promise<ProdutoHit | null> {
  if (gtinDigits.length < 8) return null
  const { data: vinculo } = await supabase
    .from('vinculos_fornecedor_produto')
    .select('produto_id')
    .eq('loja_id', lojaId)
    .eq('gtin_origem', gtinDigits)
    .limit(1)
    .maybeSingle()
  const produtoId = (vinculo as { produto_id?: string } | null)?.produto_id
  if (!produtoId) return null
  const { data } = await supabase
    .from('produtos')
    .select('id, nome, codigo_barras, preco_varejo, ncm, categoria_id')
    .eq('id', produtoId)
    .eq('loja_id', lojaId)
    .maybeSingle()
  return comCusto(supabase, data as Omit<ProdutoHit, 'preco_custo'> | null)
}

export async function listarCategoriasLoja(
  supabase: SupabaseClient,
  _lojaId: string,
): Promise<CategoriaRow[]> {
  const { data } = await supabase
    .from('categorias')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome')
    .limit(200)
  return (data as CategoriaRow[] | null) ?? []
}

export async function medianaPrecoCategoria(
  supabase: SupabaseClient,
  lojaId: string,
  categoriaId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('produtos')
    .select('preco_varejo')
    .eq('loja_id', lojaId)
    .eq('categoria_id', categoriaId)
    .eq('ativo', true)
    .limit(40)
  const vals = ((data as { preco_varejo: number | string }[] | null) ?? []).map((r) =>
    Number(r.preco_varejo),
  )
  return medianaPrecos(vals)
}

export function sugestaoFromProdutoHit(
  gtin: string,
  hit: ProdutoHit,
  fonte: 'catalogo' | 'vinculo_nfe',
  categorias: CategoriaRow[],
): SugestaoCadastroProduto {
  const custo = hit.preco_custo != null ? Number(hit.preco_custo) : null
  let preco = Number(hit.preco_varejo)
  if (!Number.isFinite(preco) || preco <= 0) {
    preco = sugerirPrecoVarejoDeCusto(custo) ?? 0
  }
  const cat = categorias.find((c) => c.id === hit.categoria_id) ?? null
  return {
    gtin,
    nome: hit.nome,
    precoVarejo: preco > 0 ? preco : null,
    precoCusto: custo != null && custo > 0 ? custo : null,
    ncm: hit.ncm,
    categoriaId: hit.categoria_id,
    categoriaNome: cat?.nome ?? null,
    marca: null,
    fontes: [fonte],
    jaCadastrado: fonte === 'catalogo',
    produtoIdExistente: fonte === 'catalogo' ? hit.id : null,
    knownSuggestion: true,
  }
}

export function resolverCategoriaComPistas(
  categorias: CategoriaRow[],
  pistas: Array<string | null | undefined>,
): { id: string; nome: string } | null {
  const id = sugerirCategoriaId(categorias, pistas)
  if (!id) return null
  const cat = categorias.find((c) => c.id === id)
  return cat ? { id: cat.id, nome: cat.nome } : null
}
