/**
 * Helpers do estoque inicial no cadastro de produto (exceção SSoT fechada).
 * Sem novo fluxo de estoque — só intenção, feedback e mapeamento de erros RPC.
 * Mensagens PT espelham `estoque.err_*` (borda inventory); paths novos usam inventoryMessages.
 */

import {
  INVENTORY_ERROR_CODES,
  mapAjusteRpcMessageToCode,
  type InventoryErrorCode,
} from '@shared-core/src/inventory'

export type EstoqueInicialIntent = {
  quantidade: number
  minimo: number
  /** Usuário pediu qty > 0 e/ou mínimo > 0. */
  deveAplicar: boolean
}

export function parseEstoqueInicialIntent(qtyRaw: string, minRaw: string): EstoqueInicialIntent {
  const quantidade = Number.parseInt(qtyRaw || '0', 10)
  const minimo = Number.parseInt(minRaw || '0', 10)
  const qtyOk = Number.isFinite(quantidade) && quantidade > 0
  const minOk = Number.isFinite(minimo) && minimo > 0
  return {
    quantidade: qtyOk ? quantidade : 0,
    minimo: minOk ? minimo : 0,
    deveAplicar: qtyOk || minOk,
  }
}

/** Fallback PT alinhado a `estoque.err_*` — evita import lib → app. */
const CODE_TO_PT: Record<InventoryErrorCode, string> = {
  [INVENTORY_ERROR_CODES.NOT_FOUND]:
    'Linha de estoque não encontrada para este produto. Abra Estoque e tente novamente.',
  [INVENTORY_ERROR_CODES.AUTH_REQUIRED]:
    'Sessão inválida para ajustar estoque. Faça login novamente.',
  [INVENTORY_ERROR_CODES.LOJA_REQUIRED]: 'Não foi possível identificar a loja da sessão.',
  [INVENTORY_ERROR_CODES.LOJA_MISMATCH]:
    'A loja da sessão não coincide com a loja do estoque.',
  [INVENTORY_ERROR_CODES.QTY_INVALID]: 'Quantidade de estoque inválida.',
  [INVENTORY_ERROR_CODES.MIN_INVALID]: 'Estoque mínimo inválido.',
  [INVENTORY_ERROR_CODES.REASON_INVALID]: 'Motivo de ajuste de estoque inválido.',
  [INVENTORY_ERROR_CODES.OBS_REQUIRED]: 'Informe uma observação para este ajuste.',
  [INVENTORY_ERROR_CODES.PROFILE_DENIED]:
    'Seu perfil não pode ajustar estoque. Use uma conta de gerente, dono ou administrador.',
  [INVENTORY_ERROR_CODES.INSUFFICIENT]: 'Estoque insuficiente para esta operação.',
  [INVENTORY_ERROR_CODES.TRANSFER_SAME_STORE]:
    'Lojas origem e destino devem ser diferentes.',
  [INVENTORY_ERROR_CODES.TRANSFER_KEY_REQUIRED]: 'Chave de idempotência ausente.',
  [INVENTORY_ERROR_CODES.REMESSA_ID_REQUIRED]: 'Identificador da remessa ausente.',
  [INVENTORY_ERROR_CODES.CONFERENCIA_PENDENTE]: 'Há itens sem contagem registrada nesta remessa.',
  [INVENTORY_ERROR_CODES.CONFERENCIA_QTD_INVALIDA]: 'Quantidade conferida inválida.',
  [INVENTORY_ERROR_CODES.RECEBIMENTO_STATUS_INVALIDO]: 'Situação da remessa não permite esta operação.',
  [INVENTORY_ERROR_CODES.OC_ID_REQUIRED]: 'Identificador da ordem de compra ausente.',
  [INVENTORY_ERROR_CODES.OC_ITENS_REQUIRED]: 'Informe ao menos um item recebido.',
  [INVENTORY_ERROR_CODES.NFE_PAYLOAD_INVALID]: 'Dados da NF-e inválidos para importação.',
  [INVENTORY_ERROR_CODES.NFE_IMPORTACAO_ID_REQUIRED]: 'Identificador da importação de NF-e ausente.',
  [INVENTORY_ERROR_CODES.ADJUST_FAILED]: 'Não foi possível ajustar o estoque.',
  [INVENTORY_ERROR_CODES.MOVEMENT_FAILED]: 'Não foi possível registrar o movimento de estoque.',
  [INVENTORY_ERROR_CODES.LIST_FAILED]: 'Não foi possível listar o estoque.',
  [INVENTORY_ERROR_CODES.READ_FAILED]: 'Não foi possível consultar o estoque.',
  [INVENTORY_ERROR_CODES.UNKNOWN]: 'Erro de estoque desconhecido.',
}

export function mensagemErroAjusteEstoqueManual(detalhe: string): string {
  const raw = (detalhe ?? '').trim()
  if (!raw) return CODE_TO_PT[INVENTORY_ERROR_CODES.ADJUST_FAILED]
  const code = mapAjusteRpcMessageToCode(raw)
  if (code === INVENTORY_ERROR_CODES.ADJUST_FAILED && !raw.includes('AJUSTE_ESTOQUE')) {
    return raw
  }
  return CODE_TO_PT[code]
}

export type FeedbackCadastroEstoque =
  | { kind: 'success_pleno' }
  | { kind: 'success_sem_estoque_pedido' }
  | { kind: 'produto_ok_estoque_falhou'; errorDetail: string | null }

/**
 * Decide o feedback pós-create. Nunca classifica como sucesso pleno se o
 * estoque inicial foi pedido e falhou.
 */
export function resolverFeedbackCadastroEstoque(opts: {
  estoquePedido: boolean
  estoqueOk: boolean
  estoqueErro: string | null
}): FeedbackCadastroEstoque {
  if (!opts.estoquePedido) return { kind: 'success_sem_estoque_pedido' }
  if (opts.estoqueOk) return { kind: 'success_pleno' }
  return { kind: 'produto_ok_estoque_falhou', errorDetail: opts.estoqueErro }
}
