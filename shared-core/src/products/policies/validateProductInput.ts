/**
 * Validação pura create/update — só codes (sem mensagem de idioma).
 * Regras espelham adapters Writer/Updater / formulário legado.
 */

import type { CreateProductCommand, UpdateProductCommand } from '../contracts'
import { PRODUCT_ERROR_CODES, type ProductErrorCode } from '../errorCodes'

export type ValidateProductResult =
  | { ok: true }
  | { ok: false; code: ProductErrorCode }

function nomeInvalido(nome: string | undefined): boolean {
  return (nome ?? '').trim().length < 2
}

function atacadoInvalido(atacado: number | null | undefined, precoVarejo: number): boolean {
  if (atacado === undefined || atacado === null) return false
  const a = Number(atacado)
  return Number.isFinite(a) && a >= precoVarejo
}

/**
 * Validação do comando de criação (RPC 270 na borda).
 * Preço: finito e >= 0 (espelho CRIAR_PRODUTO_PRECO).
 */
export function validateCreateProductCommand(
  command: CreateProductCommand,
): ValidateProductResult {
  if (!command.atorId?.trim()) {
    return { ok: false, code: PRODUCT_ERROR_CODES.AUTH_REQUIRED }
  }
  if (!command.lojaId?.trim()) {
    return { ok: false, code: PRODUCT_ERROR_CODES.LOJA_REQUIRED }
  }
  if (nomeInvalido(command.input.nome)) {
    return { ok: false, code: PRODUCT_ERROR_CODES.NAME_INVALID }
  }

  const preco = Number(command.input.precoVarejo)
  if (!Number.isFinite(preco) || preco < 0) {
    return { ok: false, code: PRODUCT_ERROR_CODES.PRICE_INVALID }
  }

  if (atacadoInvalido(command.input.precoAtacado, preco)) {
    return { ok: false, code: PRODUCT_ERROR_CODES.ATACADO_INVALID }
  }

  const estoque = command.input.estoqueInicial
  if (estoque !== undefined && estoque !== null) {
    const q = Number(estoque)
    if (!Number.isFinite(q) || q < 0) {
      return { ok: false, code: PRODUCT_ERROR_CODES.ESTOQUE_INVALID }
    }
  }

  return { ok: true }
}

/**
 * Validação do comando de atualização de catálogo.
 * Preço: finito e > 0 (espelho EditarProdutoCatalogoSchema).
 */
export function validateUpdateProductCommand(
  command: UpdateProductCommand,
): ValidateProductResult {
  if (!command.id?.trim()) {
    return { ok: false, code: PRODUCT_ERROR_CODES.UPDATE_WITHOUT_ID }
  }
  if (!command.lojaId?.trim()) {
    return { ok: false, code: PRODUCT_ERROR_CODES.LOJA_REQUIRED }
  }
  if (nomeInvalido(command.input.nome)) {
    return { ok: false, code: PRODUCT_ERROR_CODES.NAME_INVALID }
  }

  const preco = Number(command.input.precoVarejo)
  if (!Number.isFinite(preco) || preco <= 0) {
    return { ok: false, code: PRODUCT_ERROR_CODES.PRICE_NOT_POSITIVE }
  }

  const barcode = command.input.codigoBarras?.trim()
  if (barcode && barcode.length < 3) {
    return { ok: false, code: PRODUCT_ERROR_CODES.BARCODE_TOO_SHORT }
  }

  // Onda 2: par legado oculto não valida contra varejo — faixas são SSoT.
  return { ok: true }
}
