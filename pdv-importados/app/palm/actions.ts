'use server'

import {
  assumirPedidoPalmImpl,
  cancelarPedidoPalmImpl,
  enviarPedidoPalmImpl,
  listarMeusPedidosPalmImpl,
  listarPedidosPalmDisponiveisImpl,
} from '@/app/palm/server/palmPedidos.impl'
import { buscarProdutoPalmImpl, cotarItemPalmImpl } from '@/app/palm/server/palmCatalogo.impl'

export async function buscarProdutoPalm(termo: string) {
  return buscarProdutoPalmImpl(termo)
}

export async function cotarItemPalm(produtoId: string, quantidade: number) {
  return cotarItemPalmImpl(produtoId, quantidade)
}

export async function enviarPedidoPalm(input: {
  clientRequestId: string
  clienteId?: string | null
  itens: { produtoId: string; quantidade: number }[]
}) {
  return enviarPedidoPalmImpl(input)
}

export async function listarMeusPedidosPalm() {
  return listarMeusPedidosPalmImpl()
}

export async function listarPedidosPalmDisponiveis() {
  return listarPedidosPalmDisponiveisImpl()
}

export async function assumirPedidoPalm(id: string) {
  return assumirPedidoPalmImpl(id)
}

export async function cancelarPedidoPalm(id: string, motivo: string) {
  return cancelarPedidoPalmImpl(id, motivo)
}
