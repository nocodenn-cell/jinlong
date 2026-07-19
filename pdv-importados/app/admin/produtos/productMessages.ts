/**
 * Resolução i18n na borda — codes do domínio products → catálogo.
 * Missão Products 8; não altera regras de validação/exclusão/CRUD.
 */

import {
  PRODUCT_ERROR_CODES,
  type ProductErrorCode,
  type ProductErrorParams,
} from '@shared-core/src/products'
import { resolveAppMessage, tApp } from '@/i18n/catalogAdapter'
import { fmtTemplate } from '@/i18n/fmtTemplate'

/** Chaves no namespace `produtos` (pt.json / zh.json). */
const CODE_TO_KEY: Record<ProductErrorCode, string> = {
  [PRODUCT_ERROR_CODES.NOT_FOUND]: 'produtos.err_nao_encontrado',
  [PRODUCT_ERROR_CODES.NAME_INVALID]: 'produtos.err_nome_invalido',
  [PRODUCT_ERROR_CODES.PRICE_INVALID]: 'produtos.err_preco_invalido',
  [PRODUCT_ERROR_CODES.PRICE_NOT_POSITIVE]: 'produtos.err_preco_nao_positivo',
  [PRODUCT_ERROR_CODES.UPDATE_WITHOUT_ID]: 'produtos.err_update_sem_id',
  [PRODUCT_ERROR_CODES.AUTH_REQUIRED]: 'produtos.err_auth',
  [PRODUCT_ERROR_CODES.LOJA_REQUIRED]: 'produtos.err_loja',
  [PRODUCT_ERROR_CODES.ESTOQUE_INVALID]: 'produtos.err_estoque_invalido',
  [PRODUCT_ERROR_CODES.BARCODE_TOO_SHORT]: 'produtos.err_codigo_barras_minimo',
  [PRODUCT_ERROR_CODES.BARCODE_DUPLICATE]: 'produtos.err_codigo_barras_duplicado',
  [PRODUCT_ERROR_CODES.ATACADO_INVALID]: 'produtos.err_preco_atacado',
  [PRODUCT_ERROR_CODES.QTY_INVALID]: 'produtos.err_qtd_invalida',
  [PRODUCT_ERROR_CODES.PRICE_PRODUCT_NOT_FOUND]: 'produtos.err_preco_produto_nao_encontrado',
  [PRODUCT_ERROR_CODES.PRICE_RESPONSE_INVALID]: 'produtos.err_preco_resposta_invalida',
  [PRODUCT_ERROR_CODES.RELOAD_AFTER_CREATE_FAILED]: 'produtos.err_reload_pos_create',
  [PRODUCT_ERROR_CODES.SAVE_FAILED]: 'produtos.err_salvar_falhou',
  [PRODUCT_ERROR_CODES.HAS_OPERATIONAL_REFS]: 'produtos.err_refs_operacionais',
  [PRODUCT_ERROR_CODES.LIST_FAILED]: 'produtos.err_listagem_falhou',
  [PRODUCT_ERROR_CODES.LIFECYCLE_FAILED]: 'produtos.err_lifecycle_falhou',
  [PRODUCT_ERROR_CODES.UNKNOWN]: 'produtos.err_desconhecido',
}

const FALLBACK_KEY = 'produtos.err_desconhecido'

function isProductErrorCode(value: string): value is ProductErrorCode {
  return Object.values(PRODUCT_ERROR_CODES).includes(value as ProductErrorCode)
}

export function resolveProductMessage(
  idioma: unknown,
  code: ProductErrorCode | string,
  params?: ProductErrorParams,
): string {
  const key = isProductErrorCode(code) ? CODE_TO_KEY[code] : FALLBACK_KEY
  const resolved = isProductErrorCode(code)
    ? tApp(idioma, key)
    : tApp(idioma, FALLBACK_KEY)

  if (!params) return resolved
  const vars: Record<string, string> = {}
  if (params.nome !== undefined) vars.nome = params.nome
  if (params.motivo !== undefined) vars.motivo = params.motivo
  return Object.keys(vars).length > 0 ? fmtTemplate(resolved, vars) : resolved
}

/** Detalhe de resolução (missing key / locale efetivo) — testes e telemetria. */
export function resolveProductMessageDetailed(
  idioma: unknown,
  code: ProductErrorCode,
): ReturnType<typeof resolveAppMessage> {
  return resolveAppMessage(idioma, CODE_TO_KEY[code] ?? FALLBACK_KEY)
}

/** Falha tipada — localiza se houver `code`. */
export function localizeProductFailure(
  idioma: unknown,
  result: {
    error: string
    code?: ProductErrorCode
    params?: ProductErrorParams
  },
): { ok: false; error: string } {
  if (!result.code) return { ok: false, error: result.error }
  return {
    ok: false,
    error: resolveProductMessage(idioma, result.code, result.params),
  }
}
