'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  colocarVendaEmEsperaCaixa,
  descartarVendaEmEsperaCaixa,
  obterClienteCaixa,
} from '@/app/caixa/actions'
import { caixaFmt } from '@/app/caixa/caixaI18n'
import { isCaixaAberto, type CaixaStatusUi } from '@/app/caixa/hooks/useCaixaStatusMovimentacoes'
import { assumirPedidoPalm, listarPedidosPalmDisponiveis } from '@/app/palm/actions'
import { mapAssumidoParaCarrinho } from '@/app/palm/domain/palmPedido'
import type { PedidoPalmCard } from '@/app/palm/domain/tiposPalm'
import type { Mensagens } from '@/i18n/getMessages'
import type { ItemCarrinhoComPreco } from '@/stores/carrinhoStore'
import { useCarrinhoStore } from '@/stores/carrinhoStore'
import type { ReprecificarQuantidadeInput } from '@/app/caixa/hooks/useReprecificarQuantidadeCaixa'

type SetMensagem = (texto: string, opts?: { kind?: 'success' | 'error' | 'warning' | 'info' }) => void

export type UsePalmPedidosCaixaDeps = {
  m: Mensagens
  itens: ItemCarrinhoComPreco[]
  totalBruto: number
  totalDesconto: number
  totalLiquidoComGerente: number
  descontoGerentePercentual: number
  caixaStatus: CaixaStatusUi | null
  clienteId: string | null
  vendaEmEsperaOrigemId: string | null
  setVendaEmEsperaOrigemId: (id: string | null) => void
  substituirCarrinho: (itens: ItemCarrinhoComPreco[]) => void
  reprecificar: (args: ReprecificarQuantidadeInput) => void
  setCaixaMensagem: SetMensagem
  tocarFeedback: (kind: 'ok' | 'erro') => void
  focarCampoBusca: () => void
  setClienteId: (id: string | null) => void
  setClienteNome: (nome: string | null) => void
}

export function usePalmPedidosCaixa(deps: UsePalmPedidosCaixaDeps) {
  const { setCaixaMensagem } = deps
  const [pedidos, setPedidos] = useState<PedidoPalmCard[]>([])
  const [carregando, setCarregando] = useState(false)
  const [processando, setProcessando] = useState(false)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    const res = await listarPedidosPalmDisponiveis()
    setCarregando(false)
    if (res.ok) setPedidos(res.pedidos)
    else setCaixaMensagem(res.error, { kind: 'error' })
  }, [setCaixaMensagem])

  useEffect(() => { void recarregar() }, [recarregar])

  const assumir = useCallback(async (id: string) => {
    if (useCarrinhoStore.getState().vendaFinalizacaoPendente) {
      deps.setCaixaMensagem(deps.m.caixa.msg_venda_pendente_bloqueio, { kind: 'warning' })
      return
    }
    setProcessando(true)
    const estacionou = await estacionarCupomAtual(deps)
    if (!estacionou) { setProcessando(false); return }
    const res = await assumirPedidoPalm(id)
    if (!res.ok) {
      deps.setCaixaMensagem(res.error, { kind: 'error' })
      deps.tocarFeedback('erro')
      setProcessando(false)
      return
    }
    if (res.bloqueado) {
      deps.setCaixaMensagem(deps.m.palm.caixa_bloqueado, { kind: 'error' })
      deps.tocarFeedback('erro')
      setProcessando(false)
      await recarregar()
      return
    }
    carregarNoCupom(deps, res)
    const assumido = caixaFmt(deps.m.palm.caixa_assumido, { n: res.numeroLocal })
    const texto = res.precoAlterado ? `${deps.m.palm.preco_alterado} ${assumido}` : assumido
    deps.setCaixaMensagem(texto, { kind: res.precoAlterado ? 'warning' : 'success' })
    deps.tocarFeedback('ok')
    setProcessando(false)
    await recarregar()
    deps.focarCampoBusca()
  }, [deps, recarregar])

  return { pedidos, carregando, processando, assumir, recarregar }
}

async function estacionarCupomAtual(deps: UsePalmPedidosCaixaDeps): Promise<boolean> {
  if (deps.itens.length === 0) return true
  const parked = await colocarVendaEmEsperaCaixa({
    itens: deps.itens,
    totalBruto: deps.totalBruto,
    totalDesconto: deps.totalDesconto,
    totalLiquido: deps.totalLiquidoComGerente,
    caixaId: isCaixaAberto(deps.caixaStatus) ? deps.caixaStatus.caixaId : null,
    descontoGerentePercentual: deps.descontoGerentePercentual > 0 ? deps.descontoGerentePercentual : null,
    clienteId: deps.clienteId,
  })
  if (!parked.ok) {
    deps.setCaixaMensagem(parked.error, { kind: 'error' })
    deps.tocarFeedback('erro')
    return false
  }
  if (deps.vendaEmEsperaOrigemId) {
    await descartarVendaEmEsperaCaixa(deps.vendaEmEsperaOrigemId, 'Substituído por pedido PALM')
    deps.setVendaEmEsperaOrigemId(null)
  }
  return true
}

function carregarNoCupom(
  deps: UsePalmPedidosCaixaDeps,
  res: { id: string; itens: Parameters<typeof mapAssumidoParaCarrinho>[0]; clienteId: string | null },
): void {
  const itens = mapAssumidoParaCarrinho(res.itens)
  deps.substituirCarrinho(itens)
  deps.setVendaEmEsperaOrigemId(res.id)
  deps.setClienteId(res.clienteId)
  deps.setClienteNome(null)
  if (res.clienteId) {
    void obterClienteCaixa(res.clienteId).then((cliente) => {
      if (cliente.ok && cliente.cliente) deps.setClienteNome(cliente.cliente.nome)
    })
  }
  for (const item of itens) {
    deps.reprecificar({
      itemId: item.id,
      produtoId: item.produtoId,
      quantidade: item.quantidade,
      tipoPrecoAtual: item.resultado?.tipoPreco ?? 'VAREJO',
    })
  }
}
