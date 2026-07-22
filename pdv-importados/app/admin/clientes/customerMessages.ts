/**
 * Resolução i18n na borda — codes do domínio customers → catálogo.
 * Missão 5.3; não altera regras de validação/exclusão.
 */

import {
  CUSTOMER_ERROR_CODES,
  type CustomerErrorCode,
  type CustomerErrorParams,
} from '@shared-core/src/customers'
import { tApp } from '@/i18n/catalogAdapter'
import { fmtTemplate } from '@/i18n/fmtTemplate'

/** Chaves no namespace `clientes` (pt.json / zh.json). */
const CODE_TO_KEY: Record<CustomerErrorCode, string> = {
  [CUSTOMER_ERROR_CODES.NAME_INVALID]: 'clientes.err_nome_invalido',
  [CUSTOMER_ERROR_CODES.CPF_INVALID]: 'clientes.err_cpf_invalido',
  [CUSTOMER_ERROR_CODES.CNPJ_INVALID]: 'clientes.err_cnpj_invalido',
  [CUSTOMER_ERROR_CODES.EMAIL_INVALID]: 'clientes.err_email',
  [CUSTOMER_ERROR_CODES.LIMIT_NEGATIVE]: 'clientes.err_limite_negativo',
  [CUSTOMER_ERROR_CODES.HAS_OPEN_CREDIT]: 'clientes.err_crediario_aberto',
  [CUSTOMER_ERROR_CODES.NOT_FOUND]: 'clientes.err_nao_encontrado',
  [CUSTOMER_ERROR_CODES.CREATE_WITH_ID]: 'clientes.err_create_com_id',
  [CUSTOMER_ERROR_CODES.UPDATE_WITHOUT_ID]: 'clientes.err_update_sem_id',
}

export function resolveCustomerMessage(
  idioma: unknown,
  code: CustomerErrorCode,
  params?: CustomerErrorParams,
): string {
  const key = CODE_TO_KEY[code]
  const raw = tApp(idioma, key)
  if (!params?.nome) return raw
  return fmtTemplate(raw, { nome: params.nome })
}

/** Falha tipada da action — localiza se houver `code`. */
export function localizeCustomerFailure(
  idioma: unknown,
  result: {
    error: string
    code?: CustomerErrorCode
    params?: CustomerErrorParams
  },
): { ok: false; error: string } {
  if (!result.code) return { ok: false, error: result.error }
  return {
    ok: false,
    error: resolveCustomerMessage(idioma, result.code, result.params),
  }
}
