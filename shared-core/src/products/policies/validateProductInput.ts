/**
 * Validação pura create/update — só codes (sem mensagem de idioma).
 * Regras espelham adapters Writer/Updater / formulário legado.
 */

import type { CreateProductCommand, UpdateProductCommand } from '../contracts'
import { PRODUCT_ERROR_CODES, type ProductErrorCode } from '../errorCodes'
import {
  MOEDA_ENTRADA_MAX,
  QUANTIDADE_INTEIRA_ENTRADA_MAX,
} from '../../formatting/entradaNumerica'

export type ValidateProductResult =
  | { ok: true }
  | { ok: false; code: ProductErrorCode }

function nomeInvalido(nome: string | undefined): boolean {
  return (nome ?? '').trim().length < 2
}

/** Moeda válida no banco: finita, até 2 casas e dentro de numeric(10,2). */
function moedaInvalida(valor: number): boolean {
  if (!Number.isFinite(valor) || valor > MOEDA_ENTRADA_MAX) return true
  return Math.abs(valor * 100 - Math.round(valor * 100)) > 1e-6
}

/** Quantidade de estoque dentro do teto de entrada (não arredonda). */
function quantidadeInvalida(valor: number): boolean {
  return !Number.isFinite(valor) || valor < 0 || valor > QUANTIDADE_INTEIRA_ENTRADA_MAX
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
  if (moedaInvalida(preco) || preco < 0) {
    return { ok: false, code: PRODUCT_ERROR_CODES.PRICE_INVALID }
  }

  const atacado = command.input.precoAtacado
  if (atacado !== undefined && atacado !== null) {
    const a = Number(atacado)
    if (moedaInvalida(a) || a < 0) {
      return { ok: false, code: PRODUCT_ERROR_CODES.PRICE_INVALID }
    }
    if (a >= preco) {
      return { ok: false, code: PRODUCT_ERROR_CODES.ATACADO_INVALID }
    }
  }

  const estoque = command.input.estoqueInicial
  if (estoque !== undefined && estoque !== null) {
    if (quantidadeInvalida(Number(estoque))) {
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
  if (moedaInvalida(preco) || preco <= 0) {
    return { ok: false, code: PRODUCT_ERROR_CODES.PRICE_NOT_POSITIVE }
  }

  const barcode = command.input.codigoBarras?.trim()
  if (barcode && barcode.length < 3) {
    return { ok: false, code: PRODUCT_ERROR_CODES.BARCODE_TOO_SHORT }
  }

  const atacado = command.input.precoAtacado
  if (atacado !== undefined && atacado !== null) {
    const a = Number(atacado)
    if (moedaInvalida(a) || a < 0) {
      return { ok: false, code: PRODUCT_ERROR_CODES.PRICE_INVALID }
    }
    if (a >= preco) {
      return { ok: false, code: PRODUCT_ERROR_CODES.ATACADO_INVALID }
    }
  }

  return { ok: true }
}
