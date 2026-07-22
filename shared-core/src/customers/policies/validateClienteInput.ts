import { CUSTOMER_ERROR_CODES } from '../errorCodes'
import type { ValidateClienteResult } from '../contracts'
import type { ClienteInput } from '../types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Validação pura de create/update — codes + mensagens PT idênticas à action legada
 * (`app/gerente/clientes/actions.ts` → `validar`).
 */
export function validateClienteInput(input: ClienteInput): ValidateClienteResult {
  if (!input.nome || input.nome.trim().length < 2) {
    return {
      ok: false,
      code: CUSTOMER_ERROR_CODES.NAME_INVALID,
      error: 'Nome inválido.',
    }
  }

  const docDigits = input.documento.replace(/\D/g, '')
  if (input.tipo === 'PF' && docDigits.length !== 11) {
    return {
      ok: false,
      code: CUSTOMER_ERROR_CODES.CPF_INVALID,
      error: 'CPF deve ter 11 dígitos.',
    }
  }
  if (input.tipo === 'PJ' && docDigits.length !== 14) {
    return {
      ok: false,
      code: CUSTOMER_ERROR_CODES.CNPJ_INVALID,
      error: 'CNPJ deve ter 14 dígitos.',
    }
  }
  if (input.email && !EMAIL_RE.test(input.email)) {
    return {
      ok: false,
      code: CUSTOMER_ERROR_CODES.EMAIL_INVALID,
      error: 'E-mail inválido.',
    }
  }
  if (input.limite_crediario < 0) {
    return {
      ok: false,
      code: CUSTOMER_ERROR_CODES.LIMIT_NEGATIVE,
      error: 'Limite não pode ser negativo.',
    }
  }

  return { ok: true }
}
