import { createClient } from '@/lib/supabase/server'
import { calcularPrecoProdutoCaixa, consultarEstoqueProdutoCaixa } from '@/app/caixa/actions'
import { aplicarFiltroProdutoVendavel, isProdutoVendavel } from '@/lib/catalog/aplicarFiltroProdutoVendavel'
import { baixoEstoque } from '@/app/palm/domain/palmPedido'
import type { ProdutoPalm } from '@/app/palm/domain/tiposPalm'
import { exigirSessaoPalm, textoPalm, type SessaoPalm } from '@/app/palm/server/palmSessao'

export type { ProdutoPalm }

const COLUNAS =
  'id, nome, codigo_barras, codigo_interno, observacao, imagem_url, localizacao_prateleira, preco_varejo, ativo, status_publicacao'

export type BuscaPalmResult =
  | { ok: true; produtos: ProdutoPalm[] }
  | { ok: false; error: string }

export type CotacaoPalmResult =
  | { ok: true; preco: number; tipo: 'VAREJO' | 'ATACADO'; quantidadeMinima: number | null; estoque: number | null }
  | { ok: false; error: string }

type LinhaProduto = {
  id: string
  nome: string
  codigo_barras: string | null
  codigo_interno: string | null
  observacao: string | null
  imagem_url: string | null
  localizacao_prateleira: string | null
  preco_varejo: number | string
  ativo: boolean
  status_publicacao: string | null
}

export async function buscarProdutoPalmImpl(termo: string): Promise<BuscaPalmResult> {
  const sessao = await exigirSessaoPalm()
  if (!sessao.ok) return sessao
  const frag = fragmentoBusca(termo)
  if (frag.length < 1) return { ok: false, error: textoPalm(sessao.usuario.idioma, 'erro_busca') }

  const supabase = await createClient()
  const { data, error } = await aplicarFiltroProdutoVendavel(
    supabase.from('produtos').select(COLUNAS),
  )
    .eq('loja_id', sessao.usuario.lojaId)
    .or(`nome.ilike.%${frag}%,codigo_barras.ilike.%${frag}%,codigo_interno.ilike.%${frag}%`)
    .order('nome')
    .limit(8)

  if (error) return { ok: false, error: textoPalm(sessao.usuario.idioma, 'erro_generico') }
  const linhas = ((data ?? []) as LinhaProduto[]).filter(isProdutoVendavel)
  const produtos = await Promise.all(linhas.map((linha) => montarProduto(sessao, linha)))
  return { ok: true, produtos }
}

export async function cotarItemPalmImpl(produtoId: string, quantidade: number): Promise<CotacaoPalmResult> {
  const sessao = await exigirSessaoPalm()
  if (!sessao.ok) return sessao
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    return { ok: false, error: textoPalm(sessao.usuario.idioma, 'erro_quantidade') }
  }
  const cotacao = await calcularPrecoProdutoCaixa({ produtoId, quantidade })
  if (!cotacao.ok) return cotacao
  const estoque = await consultarEstoqueProdutoCaixa(produtoId)
  return {
    ok: true,
    preco: cotacao.preco,
    tipo: cotacao.tipo,
    quantidadeMinima: cotacao.quantidadeMinima,
    estoque: estoque.quantidade_atual,
  }
}

async function montarProduto(sessao: Extract<SessaoPalm, { ok: true }>, linha: LinhaProduto): Promise<ProdutoPalm> {
  const estoque = await consultarEstoqueProdutoCaixa(linha.id)
  const varejo = await calcularPrecoProdutoCaixa({ produtoId: linha.id, quantidade: 1 })
  const faixa = await menorFaixa(linha.id, sessao.usuario.lojaId)
  const atacado = faixa
    ? await calcularPrecoProdutoCaixa({ produtoId: linha.id, quantidade: faixa })
    : null
  return {
    id: linha.id,
    nome: linha.nome,
    codigo: linha.codigo_barras ?? linha.codigo_interno,
    descricao: textoOuNulo(linha.observacao),
    imagem: textoOuNulo(linha.imagem_url),
    localizacao: textoOuNulo(linha.localizacao_prateleira),
    estoque: estoque.quantidade_atual,
    estoqueMinimo: estoque.estoque_minimo,
    baixo: baixoEstoque(estoque.quantidade_atual, estoque.estoque_minimo),
    precoVarejo: varejo.ok && varejo.tipo === 'VAREJO' ? varejo.preco : null,
    precoAtacado: atacado?.ok && atacado.tipo === 'ATACADO' ? atacado.preco : null,
    atacadoMinimo: atacado?.ok && atacado.tipo === 'ATACADO' ? atacado.quantidadeMinima : null,
  }
}

async function menorFaixa(produtoId: string, lojaId: string): Promise<number | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('precos_atacado')
    .select('quantidade_minima, loja_id')
    .eq('produto_id', produtoId)
    .eq('ativo', true)
    .order('quantidade_minima', { ascending: true })
    .limit(8)
  const faixa = (data ?? []).find((item) => item.loja_id == null || item.loja_id === lojaId)
  const minima = Number(faixa?.quantidade_minima)
  return Number.isFinite(minima) && minima > 0 ? minima : null
}

function fragmentoBusca(termo: string): string {
  return termo.replace(/[%_\\]/g, '').trim()
}

function textoOuNulo(valor: string | null): string | null {
  const texto = valor?.trim() ?? ''
  return texto.length > 0 ? texto : null
}
