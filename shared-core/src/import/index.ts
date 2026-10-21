/**
 * Motor de landed cost — barrel público.
 *
 * Função principal: `calcularLandedCost(input)`.
 * Auxiliares públicos para adapters e testes: serialização canônica e códigos.
 * Não há dependência de I/O neste módulo.
 */

export { calcularLandedCost, ENGINE_VERSION } from './landedCost'
export { serializarCanonico } from './canonico'
export { LANDED_ERROR_CODES, LANDED_DIVERGENCIA_CODES } from './errorCodes'
export type { LandedErroCodigo, LandedDivergenciaCodigo } from './errorCodes'
export { DecimalErro, parseDecimal, formataDecimal } from './decimal'
export { ratear } from './rateio'
export type { BaseRateio, ParteRateio, ResultadoRateio } from './rateio'
export type {
  ArredondamentoPolitica,
  Atribuicao,
  Cambio,
  ComponentesBrl,
  ConservacaoSaida,
  CreditosSaida,
  CriterioRateio,
  Decimal,
  DescontoEntrada,
  DespesaEntrada,
  Divergencia,
  FonteCambio,
  ItemEntrada,
  ItemSaida,
  LandedCostInput,
  LandedCostOutput,
  LandedErroSaida,
  LandedResult,
  Moeda,
  PoliticaCalculo,
  RateioSaida,
  RegraTributo,
  Severidade,
  StatusRecuperabilidade,
  TributoEntrada,
} from './types'

export { verificarAprovacao } from './aprovacao'
export type { MotivoBloqueioAprovacao, ResultadoVerificacaoAprovacao } from './aprovacao'

// D6 — conciliação de duplicatas e obrigações de NF-e (pura, centavos exatos)
export { conciliarObrigacoesNfe, centavos } from './conciliacaoObrigacoes'
export type {
  ConciliacaoEntrada,
  ConciliacaoNatureza,
  ConciliacaoMotivo,
  ConciliacaoResultado,
} from './conciliacaoObrigacoes'

// Inteligência tributária (parâmetros versionados; sugestão com revisão humana)
export {
  calcularTributosImportacao, resolverParametro, CATALOGO_TRIBUTARIO_DEMO, CATALOGO_TRIBUTARIO_VERSAO, TRIBUTOS_IMPORTACAO,
} from './tributacao'
export type {
  TributoImportacao, ParametroTributario, FonteParametro, ItemTributavel, EntradaTributacao, SugestaoTributo,
  ResultadoTributacao, StatusSugestao,
} from './tributacao'
// Precificação simulada (não altera preços oficiais)
export { simularPreco, compararEstimadoReal, PrecificacaoErro } from './precificacao'
export type { CanalVenda, ModoPreco, CenarioPreco, PrecoSimulado, ComparacaoCusto } from './precificacao'
export { sugerirCriterioRateio } from './sugestaoCriterio'
