/**
 * Gate A01 (#363) passou a rejeitar retry do mesmo `venda_id` com totais
 * diferentes (`FINALIZAR_VENDA_CANONICA_RETRY_PAYLOAD_DIVERGENTE`).
 *
 * Esse erro NÃO significa que a venda falhou: a primeira chamada já gravou.
 * Tratar como falha libera o cupom, apaga a chave de idempotência e o
 * operador grava uma segunda venda (estoque e caixa em dobro).
 */

export const RPC_VENDA_RETRY_PAYLOAD_DIVERGENTE =
  'FINALIZAR_VENDA_CANONICA_RETRY_PAYLOAD_DIVERGENTE'

export const MSG_VENDA_JA_PERSISTIDA = {
  pt: 'Esta venda já foi registrada. Verifique o desfecho antes de continuar.',
  zh: '该销售已登记。请先核对结果再继续。',
} as const

export function isVendaJaPersistidaMensagem(text: string | null | undefined): boolean {
  const t = (text ?? '').trim()
  if (!t) return false
  if (t.toUpperCase().includes('RETRY_PAYLOAD_DIVERGENTE')) return true
  return t === MSG_VENDA_JA_PERSISTIDA.pt || t === MSG_VENDA_JA_PERSISTIDA.zh
}

export function deveAbrirRecuperacaoAntesDeFinalizar(
  vendaFinalizacaoPendente: boolean,
): boolean {
  return vendaFinalizacaoPendente
}

export type AcaoPosFalhaFinalizar = 'manter_recuperacao' | 'liberar_reenvio'

export function acaoPosFalhaFinalizar(error: string): AcaoPosFalhaFinalizar {
  return isVendaJaPersistidaMensagem(error) ? 'manter_recuperacao' : 'liberar_reenvio'
}
