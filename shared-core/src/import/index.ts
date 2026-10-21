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
  CATALOGO_TRIBUTARIO_PESQUISADO_PE, CATALOGO_TRIBUTARIO_PESQUISADO_PE_VERSAO,
} from './tributacao'
// Catálogo nacional (27 UFs + federais; II/IPI informados pelo cliente)
export {
  ALIQUOTAS_UF, UFS, CATALOGO_FEDERAL_NACIONAL, CATALOGO_NACIONAL_VERSAO, FONTES_CATALOGO_UF, CONSULTADO_EM, DESPESAS_FEDERAIS_INFO,
  aplicaAfrmm, aliquotaDaUf, parametroIcmsUf, montarCatalogoNacional, aliquotaInterestadualGeral, simularRevendaInterestadual,
} from './catalogoNacional'
export type {
  AliquotaUf, StatusCatalogoUf, ModalTransporte, OverrideCliente, ConfigImportacaoEmpresa, EntradaRevenda, ResultadoRevenda, AvisoRevenda,
} from './catalogoNacional'
export type {
  TributoImportacao, ParametroTributario, FonteParametro, ItemTributavel, EntradaTributacao, SugestaoTributo,
  ResultadoTributacao, StatusSugestao,
} from './tributacao'
// Precificação simulada (não altera preços oficiais)
export { simularPreco, compararEstimadoReal, PrecificacaoErro, simularFaixasAtacado, arredondarComercial, repricoSugerido } from './precificacao'
export type { CanalVenda, ModoPreco, CenarioPreco, PrecoSimulado, ComparacaoCusto, FaixaAtacado, PrecoFaixa, FinalPreco } from './precificacao'
export { sugerirCriterioRateio } from './sugestaoCriterio'
