'use server'

import type {
  AbrirCaixaOperadorResult,
  AcaoMovimentacaoCaixaResult,
  AutorizarMovimentacaoGerenteResult,
  BuscarProdutoResult,
  CalcularPrecoProdutoCaixaResult,
  CancelarVendaResult,
  CarregarRegrasResult,
  CaixaStatusOperadorResult,
  CotacaoUsdBrlResult,
  FecharCaixaOperadorResult,
  FinalizarVendaCaixaResult,
  LimiteSangriaResult,
  ConfiguracoesCaixaWebResult,
  ListarCategoriasCaixaResult,
  ObterMovimentacoesCaixaResult,
  RegistrarMovimentacaoInput,
  RegistrarMovimentacaoResult,
  ValidarGerenteDescontoResult,
} from '@/app/caixa/caixaActionTypes'
import {
  buscarProdutoParaCaixaImpl,
  carregarRegrasPrecoCaixaImpl,
  listarCategoriasAtalhoCaixaImpl,
} from '@/app/caixa/server/caixaCatalogo.impl'
import { calcularPrecoProdutoCaixaImpl } from '@/app/caixa/server/caixaPrecoProduto.impl'
import { obterCotacaoUsdBrlImpl } from '@/app/caixa/server/caixaCambioServer'
import {
  cancelarVendaImpl,
  finalizarVendaCaixaImpl,
} from '@/app/caixa/server/caixaVendas.impl'
import {
  abrirCaixaOperadorImpl,
  fecharCaixaOperadorImpl,
  obterStatusCaixaOperadorImpl,
} from '@/app/caixa/server/caixaSessaoOperador.impl'
import {
  obterLimiteSangriaSemGerenteImpl,
  validarGerenteDescontoImpl,
} from '@/app/caixa/server/caixaGerenteDesconto.impl'
import { obterConfiguracoesParaCaixaWebImpl } from '@/app/caixa/server/caixaConfiguracoes.impl'
import {
  autorizarMovimentacaoGerenteImpl,
  cancelarMovimentacaoCaixaImpl,
  estornarMovimentacaoCaixaImpl,
  obterMovimentacoesCaixaImpl,
  registrarMovimentacaoImpl,
} from '@/app/caixa/server/caixaMovimentacoes.impl'

export type {
  AbrirCaixaOperadorResult,
  AcaoMovimentacaoCaixaResult,
  AutorizarMovimentacaoGerenteResult,
  BuscarProdutoResult,
  CalcularPrecoProdutoCaixaResult,
  CancelarVendaResult,
  CarregarRegrasResult,
  CaixaStatusOperadorResult,
  CategoriaAtalhoDTO,
  CotacaoUsdBrlResult,
  FecharCaixaOperadorResult,
  FinalizarVendaCaixaResult,
  FormaMovimentacaoCaixa,
  LimiteSangriaResult,
  ConfiguracoesCaixaWebResult,
  ListarCategoriasCaixaResult,
  MovimentacaoCaixaDTO,
  ObterMovimentacoesCaixaResult,
  OrigemProdutoCaixa,
  ProdutoCaixaDTO,
  RegistrarMovimentacaoInput,
  RegistrarMovimentacaoResult,
  StatusMovimentacaoCaixa,
  TipoMovimentacaoCaixa,
  ValidarGerenteDescontoResult,
} from '@/app/caixa/caixaActionTypes'

/**
 * Regras ativas para o motor de preço no caixa (`regras_preco` via RLS; limiares em `pdv_config` via RPC).
 */
export async function carregarRegrasPrecoCaixa(): Promise<CarregarRegrasResult> {
  return carregarRegrasPrecoCaixaImpl()
}

/**
 * 1) Código de barras: mesmas variantes que o pdv-local (trim, dígitos, zeros à esquerda, cortes EAN).
 * 2) Nome ILIKE (ativo); se vazio, 3) categorias cujo nome contém o termo; se mais de um produto, pede refinamento.
 */
export async function buscarProdutoParaCaixa(termo: string): Promise<BuscarProdutoResult> {
  return buscarProdutoParaCaixaImpl(termo)
}

/** Preço unitário (varejo ou atacado) para a quantidade atual no carrinho, via RPC `calcular_preco_produto`. */
export async function calcularPrecoProdutoCaixa(input: {
  produtoId: string
  quantidade: number
  lojaId?: string | null
}): Promise<CalcularPrecoProdutoCaixaResult> {
  return calcularPrecoProdutoCaixaImpl(input)
}

/** Categorias para atalhos de busca no campo principal (preenchimento + Enter). */
export async function listarCategoriasAtalhoCaixa(): Promise<ListarCategoriasCaixaResult> {
  return listarCategoriasAtalhoCaixaImpl()
}

/** Referência USD→BRL (Frankfurter); fallback opcional via env. */
export async function obterCotacaoUsdBrl(): Promise<CotacaoUsdBrlResult> {
  return obterCotacaoUsdBrlImpl()
}

export async function obterStatusCaixaOperador(): Promise<CaixaStatusOperadorResult> {
  return obterStatusCaixaOperadorImpl()
}

export async function abrirCaixaOperador(valorInicial: number): Promise<AbrirCaixaOperadorResult> {
  return abrirCaixaOperadorImpl(valorInicial)
}

export async function fecharCaixaOperador(input: {
  valorContado: number
  motivo?: string
}): Promise<FecharCaixaOperadorResult> {
  return fecharCaixaOperadorImpl(input)
}

export async function validarGerenteDesconto(input: {
  senha: string
  lojaId?: string
  deviceFingerprint?: string
}): Promise<ValidarGerenteDescontoResult> {
  return validarGerenteDescontoImpl(input)
}

export async function obterLimiteSangriaSemGerente(): Promise<LimiteSangriaResult> {
  return obterLimiteSangriaSemGerenteImpl()
}

/** Subconjunto de `configuracoes_gerais` exposto ao caixa (RPC). */
export async function obterConfiguracoesParaCaixaWeb(): Promise<ConfiguracoesCaixaWebResult> {
  return obterConfiguracoesParaCaixaWebImpl()
}

export async function registrarMovimentacao(
  dados: RegistrarMovimentacaoInput,
): Promise<RegistrarMovimentacaoResult> {
  return registrarMovimentacaoImpl(dados)
}

export async function autorizarMovimentacaoGerente(
  movimentacaoId: string,
  gerenteSenha: string,
): Promise<AutorizarMovimentacaoGerenteResult> {
  return autorizarMovimentacaoGerenteImpl(movimentacaoId, gerenteSenha)
}

export async function obterMovimentacoesCaixa(caixaId: string): Promise<ObterMovimentacoesCaixaResult> {
  return obterMovimentacoesCaixaImpl(caixaId)
}

export async function cancelarMovimentacaoCaixa(
  movimentacaoId: string,
  motivoCancelamento?: string,
): Promise<AcaoMovimentacaoCaixaResult> {
  return cancelarMovimentacaoCaixaImpl(movimentacaoId, motivoCancelamento)
}

export async function estornarMovimentacaoCaixa(
  movimentacaoOrigemId: string,
  motivo: string,
): Promise<AcaoMovimentacaoCaixaResult> {
  return estornarMovimentacaoCaixaImpl(movimentacaoOrigemId, motivo)
}

export async function cancelarVenda(
  vendaId: string,
  motivo: string,
): Promise<CancelarVendaResult> {
  return cancelarVendaImpl(vendaId, motivo)
}

/**
 * Persiste venda + itens no Supabase e aplica baixa de estoque via RPC
 * `decrementar_estoque_seguro` (migrations 016–017: atômico + validação de operador).
 */
export async function finalizarVendaCaixa(raw: unknown): Promise<FinalizarVendaCaixaResult> {
  return finalizarVendaCaixaImpl(raw)
}

// ─── Suspensão de Vendas (Park / Hold) ────────────────────────────────────────

export type VendaSuspensaItem = {
  produtoId: string
  nome: string
  quantidade: number
  precoUnitario: number
  precoOriginal: number
  tipoPreco: string
}

export type PreVendaRow = {
  id: string
  identificacao: string
  itens: VendaSuspensaItem[]
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  totalItens: number
  criadoEm: string
}

export type PreVendaResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export type ListarPreVendasResult =
  | { ok: true; preVendas: PreVendaRow[] }
  | { ok: false; error: string }

export type AcaoPreVendaResult =
  | { ok: true; itens: VendaSuspensaItem[] }
  | { ok: false; error: string }

export type CancelarPreVendaResult =
  | { ok: true }
  | { ok: false; error: string }

export async function criarPreVenda(input: {
  identificacao: string
  itens: VendaSuspensaItem[]
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  totalItens: number
}): Promise<PreVendaResult> {
  const { createClient } = await import('@/lib/supabase/server')
  const { getLojaIdUsuario, LOJA_MATRIZ_ID } = await import('@/lib/auth/lojaUsuario')
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { ok: false, error: 'Não autenticado.' }

    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID

    const { data, error } = await supabase
      .from('vendas_suspensas')
      .insert({
        loja_id: lojaId,
        operador_id: user.id,
        identificacao: input.identificacao.trim(),
        itens: input.itens,
        total_bruto: input.totalBruto,
        total_desconto: input.totalDesconto,
        total_liquido: input.totalLiquido,
        total_itens: input.totalItens,
        status: 'ATIVA',
      })
      .select('id')
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, id: data.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao suspender venda.' }
  }
}

export async function listarPreVendasAtivas(): Promise<ListarPreVendasResult> {
  const { createClient } = await import('@/lib/supabase/server')
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('vendas_suspensas')
      .select('id, identificacao, itens, total_bruto, total_desconto, total_liquido, total_itens, criado_em')
      .eq('status', 'ATIVA')
      .order('criado_em', { ascending: false })

    if (error) return { ok: false, error: error.message }

    const preVendas: PreVendaRow[] = (data ?? []).map((r) => ({
      id: r.id,
      identificacao: r.identificacao,
      itens: r.itens as VendaSuspensaItem[],
      totalBruto: Number(r.total_bruto),
      totalDesconto: Number(r.total_desconto),
      totalLiquido: Number(r.total_liquido),
      totalItens: Number(r.total_itens),
      criadoEm: r.criado_em,
    }))
    return { ok: true, preVendas }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao listar vendas suspensas.' }
  }
}

export async function resgatarPreVenda(id: string): Promise<AcaoPreVendaResult> {
  const { createClient } = await import('@/lib/supabase/server')
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('vendas_suspensas')
      .update({ status: 'RESGATADA', atualizado_em: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'ATIVA')
      .select('itens')
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, itens: data.itens as VendaSuspensaItem[] }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao resgatar venda suspensa.' }
  }
}

export async function cancelarPreVenda(id: string): Promise<CancelarPreVendaResult> {
  const { createClient } = await import('@/lib/supabase/server')
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('vendas_suspensas')
      .update({ status: 'CANCELADA', atualizado_em: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'ATIVA')

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao cancelar venda suspensa.' }
  }
}
