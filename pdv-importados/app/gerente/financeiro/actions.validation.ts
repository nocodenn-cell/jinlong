/**
 * Facade de validação — policies em `@shared-core/financial`.
 * Mantém assinatura legada (string | null) para actions existentes.
 */

import {
  validateCreateReceivableInput,
  validateLiquidateReceivableInput,
} from '@shared-core/src/financial'

export function validarCriarTituloInput(input: {
  cliente_id: string
  valor_total: number
}): string | null {
  const r = validateCreateReceivableInput({
    clienteId: input.cliente_id,
    valorTotal: input.valor_total,
  })
  return r.ok ? null : r.error
}

export function validarLiquidarTituloInput(input: {
  titulo_id: string
  valor: number
}): string | null {
  const r = validateLiquidateReceivableInput({
    tituloId: input.titulo_id,
    valor: input.valor,
  })
  return r.ok ? null : r.error
}
