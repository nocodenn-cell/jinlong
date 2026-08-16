/**
 * Contrato FLX-04 (migration 295): conferência física, depois crédito de estoque.
 * `receber_ordem_compra(uuid, jsonb)` foi dropada — o cliente não pode mais
 * enviar quantidade no recebimento.
 */

export type ItemRecebimentoOc = {
  item_id: string
  quantidade_recebida: number
}

export type ItemConferenciaOc = {
  item_id: string
  quantidade_conferida: number
}

export type RpcError = { message: string }

export type RpcCall = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ error: RpcError | null }>

export type RecebimentoOcResult =
  | { ok: true }
  | { ok: false; etapa: 'validacao' | 'conferencia' | 'recebimento'; error: string }

export function toItensConferenciaOc(itens: ItemRecebimentoOc[]): ItemConferenciaOc[] {
  return itens.map((item) => ({
    item_id: item.item_id,
    quantidade_conferida: item.quantidade_recebida,
  }))
}

export function validarItensRecebimentoOc(itens: ItemRecebimentoOc[]): string | null {
  if (itens.length === 0) return 'Informe ao menos um item para conferência.'
  const invalido = itens.some(
    (item) =>
      !item.item_id?.trim() ||
      !Number.isFinite(item.quantidade_recebida) ||
      item.quantidade_recebida < 0,
  )
  return invalido ? 'Quantidade conferida inválida.' : null
}

export async function executarRecebimentoOrdemCompra(
  rpc: RpcCall,
  ocId: string,
  itens: ItemRecebimentoOc[],
): Promise<RecebimentoOcResult> {
  const erroValidacao = validarItensRecebimentoOc(itens)
  if (erroValidacao) return { ok: false, etapa: 'validacao', error: erroValidacao }

  const conferencia = await rpc('registrar_conferencia_ordem_compra', {
    p_oc_id: ocId,
    p_itens: toItensConferenciaOc(itens),
  })
  if (conferencia.error) {
    return { ok: false, etapa: 'conferencia', error: conferencia.error.message }
  }

  const recebimento = await rpc('receber_ordem_compra', { p_oc_id: ocId })
  if (recebimento.error) {
    return { ok: false, etapa: 'recebimento', error: recebimento.error.message }
  }

  return { ok: true }
}
