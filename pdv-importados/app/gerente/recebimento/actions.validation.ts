/** Validações puras de remessa — fora de `'use server'` para compatibilidade com Next (Server Actions só async). */

import type { StatusOC } from '@/app/gerente/compras/actions'

/**
 * Vínculo opcional do recebimento manual com uma Ordem de Compra (S8/RM-14; UX-04).
 *
 * Antes da UX-04 o vínculo só era conferido aqui e a OC não era alterada. Agora o id da OC vai
 * para `criar_confirmar_remessa_entrada`, que abate o saldo POR ITEM na mesma transação e é a
 * autoridade final (trava o pedido, recusa acima do saldo). Esta função é só a checagem amigável
 * antes de gastar a chamada: pedido encerrado, cancelado ou ainda rascunho não recebe entrada.
 */
export function validarVinculoOrdemCompra(status: StatusOC): string | null {
  if (status === 'RECEBIDA') {
    return 'Esta ordem de compra já está encerrada (recebida por completo ou encerrada com falta). Escolha outra ou lance a entrada sem pedido.'
  }
  if (status === 'CANCELADA') {
    return 'Esta ordem de compra foi cancelada e não pode receber entrada.'
  }
  if (status === 'RASCUNHO') {
    return 'Confirme a ordem de compra antes de vincular uma entrada a ela.'
  }
  return null
}

export function validarRemessaInput(input: {
  origem: string
  itens: Array<{ produto_id: string; quantidade_esperada: number; quantidade_conferida: number }>
}): string | null {
  const origem = input.origem.trim()
  if (!origem) return 'Informe a origem da remessa.'
  if (!input.itens?.length) return 'Inclua ao menos um item.'
  for (const it of input.itens) {
    if (!it.produto_id?.trim()) return 'Produto inválido na remessa.'
    if (!Number.isFinite(it.quantidade_esperada) || it.quantidade_esperada < 0) {
      return 'Quantidade esperada inválida.'
    }
    if (it.quantidade_esperada === 0) {
      return 'Quantidade esperada deve ser maior que zero.'
    }
    if (!Number.isFinite(it.quantidade_conferida) || it.quantidade_conferida < 0) {
      return 'Quantidade conferida inválida.'
    }
    if (it.quantidade_conferida === 0) {
      return 'Quantidade conferida deve ser maior que zero para confirmar a entrada.'
    }
  }
  return null
}
