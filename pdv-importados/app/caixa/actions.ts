'use server'

import type {
  AbrirCaixaOperadorResult,
  AcaoMovimentacaoCaixaResult,
  AutorizarMovimentacaoGerenteResult,
  BuscarProdutoResult,
  CancelarVendaResult,
  CarregarRegrasResult,
  CaixaStatusOperadorResult,
  FecharCaixaOperadorResult,
  FinalizarVendaCaixaResult,
  LimiteSangriaResult,
  ObterMovimentacoesCaixaResult,
  RegistrarMovimentacaoInput,
  RegistrarMovimentacaoResult,
  ValidarGerenteDescontoResult,
} from '@/app/caixa/caixaActionTypes'
import {
  buscarProdutoParaCaixaImpl,
  carregarRegrasPrecoCaixaImpl,
} from '@/app/caixa/server/caixaCatalogo.impl'
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
  CancelarVendaResult,
  CarregarRegrasResult,
  CaixaStatusOperadorResult,
  FecharCaixaOperadorResult,
  FinalizarVendaCaixaResult,
  FormaMovimentacaoCaixa,
  LimiteSangriaResult,
  MovimentacaoCaixaDTO,
  ObterMovimentacoesCaixaResult,
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
 * 2) Nome ILIKE (ativo); se mais de um resultado, pede refinamento.
 */
export async function buscarProdutoParaCaixa(termo: string): Promise<BuscarProdutoResult> {
  return buscarProdutoParaCaixaImpl(termo)
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
