/**
 * Resolução i18n na borda — codes do domínio inventory → catálogo.
 * Alinhado a productMessages / padrao_consumo_i18n.
 */

import {
  INVENTORY_ERROR_CODES,
  type InventoryErrorCode,
  type InventoryErrorParams,
} from '@shared-core/src/inventory'
import { resolveAppMessage, tApp } from '@/i18n/catalogAdapter'
import { fmtTemplate } from '@/i18n/fmtTemplate'

const CODE_TO_KEY: Record<InventoryErrorCode, string> = {
  [INVENTORY_ERROR_CODES.NOT_FOUND]: 'estoque.err_nao_encontrado',
  [INVENTORY_ERROR_CODES.AUTH_REQUIRED]: 'estoque.err_auth',
  [INVENTORY_ERROR_CODES.LOJA_REQUIRED]: 'estoque.err_loja',
  [INVENTORY_ERROR_CODES.LOJA_MISMATCH]: 'estoque.err_loja_mismatch',
  [INVENTORY_ERROR_CODES.QTY_INVALID]: 'estoque.err_qtd_invalida',
  [INVENTORY_ERROR_CODES.MIN_INVALID]: 'estoque.err_min_invalido',
  [INVENTORY_ERROR_CODES.REASON_INVALID]: 'estoque.err_motivo_invalido',
  [INVENTORY_ERROR_CODES.OBS_REQUIRED]: 'estoque.err_obs_obrigatoria',
  [INVENTORY_ERROR_CODES.PROFILE_DENIED]: 'estoque.err_perfil',
  [INVENTORY_ERROR_CODES.INSUFFICIENT]: 'estoque.err_insuficiente',
  [INVENTORY_ERROR_CODES.TRANSFER_SAME_STORE]: 'estoque.err_transfer_mesma_loja',
  [INVENTORY_ERROR_CODES.TRANSFER_KEY_REQUIRED]: 'estoque.err_transfer_chave',
  [INVENTORY_ERROR_CODES.REMESSA_ID_REQUIRED]: 'estoque.err_remessa_id',
  [INVENTORY_ERROR_CODES.CONFERENCIA_PENDENTE]: 'estoque.err_conferencia_pendente',
  [INVENTORY_ERROR_CODES.CONFERENCIA_QTD_INVALIDA]: 'estoque.err_conferencia_qtd',
  [INVENTORY_ERROR_CODES.RECEBIMENTO_STATUS_INVALIDO]: 'estoque.err_recebimento_status',
  [INVENTORY_ERROR_CODES.OC_ID_REQUIRED]: 'estoque.err_oc_id',
  [INVENTORY_ERROR_CODES.OC_ITENS_REQUIRED]: 'estoque.err_oc_itens',
  [INVENTORY_ERROR_CODES.NFE_PAYLOAD_INVALID]: 'estoque.err_nfe_payload',
  [INVENTORY_ERROR_CODES.NFE_IMPORTACAO_ID_REQUIRED]: 'estoque.err_nfe_importacao_id',
  [INVENTORY_ERROR_CODES.ADJUST_FAILED]: 'estoque.err_ajuste_falhou',
  [INVENTORY_ERROR_CODES.MOVEMENT_FAILED]: 'estoque.err_movimento_falhou',
  [INVENTORY_ERROR_CODES.LIST_FAILED]: 'estoque.err_listagem_falhou',
  [INVENTORY_ERROR_CODES.READ_FAILED]: 'estoque.err_leitura_falhou',
  [INVENTORY_ERROR_CODES.UNKNOWN]: 'estoque.err_desconhecido',
}

const FALLBACK_KEY = 'estoque.err_desconhecido'

function isInventoryErrorCode(value: string): value is InventoryErrorCode {
  return Object.values(INVENTORY_ERROR_CODES).includes(value as InventoryErrorCode)
}

export function resolveInventoryMessage(
  idioma: unknown,
  code: InventoryErrorCode | string,
  params?: InventoryErrorParams,
): string {
  const key = isInventoryErrorCode(code) ? CODE_TO_KEY[code] : FALLBACK_KEY
  const resolved = isInventoryErrorCode(code)
    ? tApp(idioma, key)
    : tApp(idioma, FALLBACK_KEY)

  if (!params) return resolved
  const vars: Record<string, string> = {}
  if (params.disponivel !== undefined) vars.disponivel = params.disponivel
  if (params.solicitado !== undefined) vars.solicitado = params.solicitado
  if (params.limite !== undefined) vars.limite = params.limite
  return Object.keys(vars).length > 0 ? fmtTemplate(resolved, vars) : resolved
}

export function resolveInventoryMessageDetailed(
  idioma: unknown,
  code: InventoryErrorCode,
): ReturnType<typeof resolveAppMessage> {
  return resolveAppMessage(idioma, CODE_TO_KEY[code] ?? FALLBACK_KEY)
}

export function localizeInventoryFailure(
  idioma: unknown,
  result: {
    error: string
    code?: InventoryErrorCode
    params?: InventoryErrorParams
  },
): { ok: false; error: string } {
  if (!result.code) return { ok: false, error: result.error }
  return {
    ok: false,
    error: resolveInventoryMessage(idioma, result.code, result.params),
  }
}
