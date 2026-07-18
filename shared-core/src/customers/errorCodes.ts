/**
 * Códigos estáveis do domínio customers — a borda resolve para i18n.
 * Strings PT em `error` permanecem só para compat / testes legado.
 */

export const CUSTOMER_ERROR_CODES = {
  NAME_INVALID: 'CUSTOMER_NAME_INVALID',
  CPF_INVALID: 'CUSTOMER_CPF_INVALID',
  CNPJ_INVALID: 'CUSTOMER_CNPJ_INVALID',
  EMAIL_INVALID: 'CUSTOMER_EMAIL_INVALID',
  LIMIT_NEGATIVE: 'CUSTOMER_LIMIT_NEGATIVE',
  HAS_OPEN_CREDIT: 'CUSTOMER_HAS_OPEN_CREDIT',
  NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  CREATE_WITH_ID: 'CUSTOMER_CREATE_WITH_ID',
  UPDATE_WITHOUT_ID: 'CUSTOMER_UPDATE_WITHOUT_ID',
} as const

export type CustomerErrorCode =
  (typeof CUSTOMER_ERROR_CODES)[keyof typeof CUSTOMER_ERROR_CODES]

/** Params opcionais para templates (ex.: {{nome}}). */
export type CustomerErrorParams = {
  nome?: string
}
