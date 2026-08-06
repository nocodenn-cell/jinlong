'use server'

import type {
  AbrirCaixaOperadorResult,
  AcaoMovimentacaoCaixaResult,
  AutorizarMovimentacaoGerenteResult,
  BuscarProdutoResult,
  BuscarProdutoComPrecoResult,
  CalcularPrecoProdutoCaixaResult,
  CancelarVendaResult,
  CarregarRegrasResult,
  CaixaStatusOperadorResult,
  CotacaoUsdBrlResult,
  FecharCaixaOperadorResult,
  FinalizarVendaCaixaResult,
  LimiteSangriaResult,
  ConfiguracoesCaixaWebResult,
  ObterMovimentacoesCaixaResult,
  RegistrarMovimentacaoInput,
  RegistrarMovimentacaoResult,
  ValidarGerenteDescontoResult,
} from '@/app/caixa/caixaActionTypes'
import {
  buscarProdutoParaCaixaImpl,
  buscarProdutoComPrecoCaixaImpl,
  carregarRegrasPrecoCaixaImpl,

} from '@/app/caixa/server/caixaCatalogo.impl'
import { calcularPrecoProdutoCaixaImpl } from '@/app/caixa/server/caixaPrecoProduto.impl'
import { obterCotacaoUsdBrlImpl } from '@/app/caixa/server/caixaCambioServer'
import {
  cancelarVendaImpl,
  finalizarVendaCaixaImpl,
} from '@/app/caixa/server/caixaVendas.impl'
import {
  buscarClientesCaixaImpl,
  obterClienteCaixaImpl,
} from '@/app/caixa/server/caixaClientesSearch.impl'
import { listarFormasPagamentoCaixaImpl } from '@/app/caixa/server/caixaFormasPagamento.impl'
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
import { obterResumoVendasTurnoImpl } from '@/app/caixa/server/caixaTurnoResumo.impl'
import { consultarProdutoRapidoCaixaImpl } from '@/app/caixa/server/caixaConsultaRapida.impl'
import {
  colocarVendaEmEsperaImpl,
  converterVendaEmEsperaImpl,
  descartarVendaEmEsperaImpl,
  listarHistoricoOperadorImpl,
  listarVendasEmEsperaImpl,
  obterDetalheHistoricoVendaImpl,
  retomarVendaEmEsperaImpl,
} from '@/app/caixa/server/caixaVendaEspera.impl'
import type { ItemCarrinho } from '@/stores/unifiedCartStore'
import type { ConsultaRapidaResult } from '@/app/caixa/caixaActionTypes'

export type { TurnoResumoResult } from '@/app/caixa/server/caixaTurnoResumo.impl'
export type {
  VendaEmEsperaCard,
  HistoricoVendaOperador,
  HistoricoVendaDetalhe,
  HistoricoVendaItemDetalhe,
} from '@/app/caixa/server/caixaVendaEspera.impl'

export type {
  AbrirCaixaOperadorResult,
  AcaoMovimentacaoCaixaResult,
  AutorizarMovimentacaoGerenteResult,
  BuscarProdutoResult,
  BuscarProdutoComPrecoResult,
  CalcularPrecoProdutoCaixaResult,
  CancelarVendaResult,
  CarregarRegrasResult,
  CaixaStatusOperadorResult,
  ConsultaRapidaResult,
  CotacaoUsdBrlResult,
  FecharCaixaOperadorResult,
  FinalizarVendaCaixaResult,
  FormaMovimentacaoCaixa,
  LimiteSangriaResult,
  ConfiguracoesCaixaWebResult,
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

/**
 * Busca produto + calcula preço autoritativo em 1 round-trip.
 * Elimina a 2ª server action no hot-path de scan.
 * Fallback: se RPC falhar, retorna preco_varejo para não bloquear o carrinho.
 */
export async function buscarProdutoComPrecoCaixa(
  termo: string,
  quantidade?: number,
): Promise<BuscarProdutoComPrecoResult> {
  return buscarProdutoComPrecoCaixaImpl(termo, quantidade)
}

/** Preço unitário (varejo ou atacado) para a quantidade atual no carrinho, via RPC `calcular_preco_produto`. */
export async function calcularPrecoProdutoCaixa(input: {
  produtoId: string
  quantidade: number
  lojaId?: string | null
}): Promise<CalcularPrecoProdutoCaixaResult> {
  return calcularPrecoProdutoCaixaImpl(input)
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

export async function obterResumoVendasTurno() {
  return obterResumoVendasTurnoImpl()
}

export async function consultarProdutoRapidoCaixa(termo: string): Promise<ConsultaRapidaResult> {
  return consultarProdutoRapidoCaixaImpl(termo)
}

export async function colocarVendaEmEsperaCaixa(input: {
  itens: ItemCarrinho[]
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  caixaId?: string | null
  descontoGerentePercentual?: number | null
  clienteId?: string | null
}) {
  return colocarVendaEmEsperaImpl(input)
}

export async function listarVendasEmEsperaCaixa() {
  return listarVendasEmEsperaImpl()
}

export async function retomarVendaEmEsperaCaixa(id: string) {
  return retomarVendaEmEsperaImpl(id)
}

export async function descartarVendaEmEsperaCaixa(id: string, motivo?: string) {
  return descartarVendaEmEsperaImpl(id, motivo)
}

/** Baixa o pedido em espera só depois que a venda foi de fato finalizada. */
export async function converterVendaEmEsperaCaixa(id: string) {
  return converterVendaEmEsperaImpl(id)
}

export async function listarHistoricoOperadorCaixa(input?: {
  inicio?: string | null
  fim?: string | null
}) {
  return listarHistoricoOperadorImpl(input)
}

export async function obterDetalheHistoricoVendaCaixa(vendaId: string) {
  return obterDetalheHistoricoVendaImpl(vendaId)
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

/* `criarProdutoRelampagoPdv` foi REMOVIDA: o PDV não cadastra produto — isso
 * pertence ao módulo Produtos (gerente/admin). Este arquivo é `'use server'`,
 * então toda export virava endpoint POST endereçável mesmo sem UI; deixar a
 * action aqui manteria a criação de produto acessível por rede a partir do
 * caixa. Ver `docs/architecture/pdv_cadastro_removido.md`. */

/** Selecao de cliente no PDV (Fase 5b). */
export async function buscarClientesCaixa(termo: string) {
  return buscarClientesCaixaImpl(termo)
}

/** Nome do cliente vinculado a uma venda retomada (guarda so o id). */
export async function obterClienteCaixa(clienteId: string) {
  return obterClienteCaixaImpl(clienteId)
}

/** F1-05: formas de pagamento ativas da loja, direto do cadastro. */
export async function listarFormasPagamentoCaixa() {
  return listarFormasPagamentoCaixaImpl()
}
