/**
 * Formatting (money / number / date) — barrel público Missão 5.2b.
 * Sem React; sem carregar catálogos i18n.
 */

export type {
  CurrencyCode,
  FormatDateTimeOptions,
  FormatMoneyOptions,
  FormatNumberOptions,
} from './types'
export { DEFAULT_CURRENCY } from './types'

export { formatMoney } from './money'
export { formatNumber } from './number'
export { formatDate, formatDateTime } from './date'

export {
  CASAS_MAX_CUSTO_CONFIGURAVEL,
  INTEIRO_MAX_INT4,
  MOEDA_MAX_NUMERIC_10_2,
  QUANTIDADE_MAX_NUMERIC_10_3,
  parseMoedaEntrada,
  parseQuantidadeEntrada,
  parseQuantidadeInteiraEntrada,
  parseValorEntrada,
} from './entradaNumerica'
export type {
  MotivoEntradaNumerica,
  OpcoesEntradaNumerica,
  ResultadoEntradaNumerica,
} from './entradaNumerica'
