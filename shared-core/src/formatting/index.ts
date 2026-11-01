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
  MOEDA_ENTRADA_MAX,
  QUANTIDADE_INTEIRA_ENTRADA_MAX,
  parseMoedaEntrada,
  parseQuantidadeInteiraEntrada,
} from './entradaNumerica'
export type { MotivoEntradaNumerica, ResultadoEntradaNumerica } from './entradaNumerica'
