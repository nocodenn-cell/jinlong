'use client'

import { useCallback, useEffect, useState } from 'react'
import { buscarClientesCaixa } from '@/app/caixa/actions'
import { caixaFmt } from '@/app/caixa/caixaI18n'
import type { Mensagens } from '@/i18n/getMessages'
import {
  estoqueSuficiente,
  limparRequestId,
  payloadEnvio,
  requestIdDe,
  totalPedido,
} from '@/app/palm/domain/palmPedido'
import type { MeuPedidoPalm, ProdutoPalm } from '@/app/palm/domain/tiposPalm'
import {
  buscarProdutoPalm,
  cancelarPedidoPalm,
  cotarItemPalm,
  enviarPedidoPalm,
  listarMeusPedidosPalm,
} from '@/app/palm/actions'
import type { ClienteOpcao, LinhaRascunho } from '@/components/palm/PalmVendasView'

export function usePalmVendas(m: Mensagens) {
  const [busca, setBusca] = useState('')
  const [produtos, setProdutos] = useState<ProdutoPalm[]>([])
  const [produtoId, setProdutoId] = useState<string | null>(null)
  const [quantidade, setQuantidade] = useState(1)
  const [linhas, setLinhas] = useState<LinhaRascunho[]>([])
  const [clienteBusca, setClienteBusca] = useState('')
  const [clientes, setClientes] = useState<ClienteOpcao[]>([])
  const [clienteId, setClienteId] = useState<string | null>(null)
  const [clienteNome, setClienteNome] = useState<string | null>(null)
  const [historico, setHistorico] = useState<MeuPedidoPalm[]>([])
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [camera, setCamera] = useState(false)

  const recarregar = useCallback(async () => {
    const res = await listarMeusPedidosPalm()
    if (res.ok) setHistorico(res.pedidos)
  }, [])

  useEffect(() => { void recarregar() }, [recarregar])

  const buscar = useCallback(async (termo: string) => {
    setErro(null)
    const res = await buscarProdutoPalm(termo)
    if (!res.ok) { setErro(res.error); setProdutos([]); return }
    setProdutos(res.produtos)
    setProdutoId(res.produtos[0]?.id ?? null)
    if (res.produtos.length === 0) setErro(m.palm.sem_resultado)
  }, [m.palm.sem_resultado])

  const adicionar = useCallback(async () => {
    const produto = produtos.find((item) => item.id === produtoId)
    if (!produto) return
    const anterior = linhas.find((item) => item.produtoId === produto.id)
    const qtd = (anterior?.quantidade ?? 0) + quantidade
    const cotacao = await cotarItemPalm(produto.id, qtd)
    if (!cotacao.ok) { setErro(cotacao.error); return }
    if (!estoqueSuficiente(qtd, cotacao.estoque)) { setErro(m.palm.estoque_insuficiente); return }
    const linha: LinhaRascunho = {
      produtoId: produto.id,
      nome: produto.nome,
      quantidade: qtd,
      precoUnitario: cotacao.preco,
      tipo: cotacao.tipo,
      quantidadeMinima: cotacao.quantidadeMinima,
    }
    setLinhas((atual) => [...atual.filter((item) => item.produtoId !== produto.id), linha])
    setErro(null)
  }, [linhas, m.palm.estoque_insuficiente, produtoId, produtos, quantidade])

  const alterarQtd = useCallback(async (id: string, qtd: number) => {
    if (!Number.isFinite(qtd) || qtd < 1) return
    const cotacao = await cotarItemPalm(id, qtd)
    if (!cotacao.ok) { setErro(cotacao.error); return }
    if (!estoqueSuficiente(qtd, cotacao.estoque)) { setErro(m.palm.estoque_insuficiente); return }
    setLinhas((atual) => atual.map((item) => item.produtoId === id
      ? { ...item, quantidade: qtd, precoUnitario: cotacao.preco, tipo: cotacao.tipo, quantidadeMinima: cotacao.quantidadeMinima }
      : item))
    setErro(null)
  }, [m.palm.estoque_insuficiente])

  const enviar = useCallback(async () => {
    setEnviando(true)
    setErro(null)
    const clientRequestId = requestIdDe(sessionStorage, () => crypto.randomUUID())
    const res = await enviarPedidoPalm({
      clientRequestId,
      clienteId,
      itens: payloadEnvio(linhas).map((item) => ({ produtoId: item.produto_id, quantidade: item.quantidade })),
    })
    setEnviando(false)
    if (!res.ok) { setErro(res.error); return }
    limparRequestId(sessionStorage)
    setLinhas([])
    setConfirmacao(caixaFmt(m.palm.enviado, { n: res.numeroLocal }))
    await recarregar()
  }, [clienteId, linhas, m.palm.enviado, recarregar])

  const cancelar = useCallback(async (id: string) => {
    const res = await cancelarPedidoPalm(id, motivo)
    if (!res.ok) { setErro(res.error); return }
    setConfirmacao(m.palm.cancelado)
    await recarregar()
  }, [m.palm.cancelado, motivo, recarregar])

  const buscarCliente = useCallback(async () => {
    const res = await buscarClientesCaixa(clienteBusca)
    if (!res.ok) { setErro(res.error); setClientes([]); return }
    setClientes(res.clientes.map((cliente) => ({ id: cliente.id, nome: cliente.nome })))
  }, [clienteBusca])

  const escolherCliente = useCallback((id: string | null) => {
    setClienteId(id)
    setClienteNome(id ? clientes.find((cliente) => cliente.id === id)?.nome ?? null : null)
    if (!id) setClientes([])
  }, [clientes])

  return {
    busca, onBusca: setBusca, onBuscar: () => void buscar(busca), onAbrirCamera: () => setCamera(true),
    produtos, produtoId, onEscolherProduto: setProdutoId, quantidade, onQuantidade: setQuantidade,
    onAdicionar: () => void adicionar(), linhas, onAlterarQtd: (id: string, qtd: number) => void alterarQtd(id, qtd),
    onRemover: (id: string) => setLinhas((atual) => atual.filter((item) => item.produtoId !== id)),
    total: totalPedido(linhas), clienteBusca, onClienteBusca: setClienteBusca, onBuscarCliente: () => void buscarCliente(),
    clientes, clienteNome, onEscolherCliente: escolherCliente, onEnviar: () => void enviar(), enviando,
    confirmacao, erro, historico, onCancelar: (id: string) => void cancelar(id), motivo, onMotivo: setMotivo,
    camera, onFecharCamera: () => setCamera(false), onCodigo: (codigo: string) => { setBusca(codigo); setCamera(false); void buscar(codigo) },
  }
}
