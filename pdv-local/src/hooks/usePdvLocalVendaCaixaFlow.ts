import { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { CaixaSessaoInvoke } from './usePdvLocalCatalogo'

type ItemVenda = {
  produtoId: string
  nome: string
  quantidade: number
  resultado: {
    precoOriginal: number
    precoUnitario: number
  }
}

type Params = {
  tauriDisponivel: boolean
  caixaAtualId: string | null
  itens: ItemVenda[]
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  descontoGerentePercentual: number
  descontoGerenteValor: number
  descontoGerenteToken: string | null
  gerenteId: string
  onSetCaixaAtualId: (id: string | null) => void
  onSetMensagem: (msg: string) => void
  onLimparCarrinho: () => void
  onSyncOutbox: (limite?: number) => Promise<void>
  onRefreshOutboxResumo: () => Promise<void>
  onFinalizarElapsedMs: (elapsedMs: number) => void
  formatarErro: (error: unknown, fallback: string) => string
  logError: (message: string, payload: unknown) => void
}

export function usePdvLocalVendaCaixaFlow({
  tauriDisponivel,
  caixaAtualId,
  itens,
  totalBruto,
  totalDesconto,
  totalLiquido,
  descontoGerentePercentual,
  descontoGerenteValor,
  descontoGerenteToken,
  gerenteId,
  onSetCaixaAtualId,
  onSetMensagem,
  onLimparCarrinho,
  onSyncOutbox,
  onRefreshOutboxResumo,
  onFinalizarElapsedMs,
  formatarErro,
  logError,
}: Params) {
  const [isFinalizandoVenda, setIsFinalizandoVenda] = useState(false)

  const abrirCaixa = useCallback(async () => {
    if (!tauriDisponivel) {
      onSetMensagem('Abra pelo app desktop (Tauri).')
      return
    }
    try {
      const trocoRaw = window.prompt('Troco inicial do caixa (R$):', '0')
      const troco = trocoRaw ? Number(trocoRaw.replace(',', '.')) : 0
      const novoCaixaId = await invoke('abrir_caixa_cmd', {
        operador_id: null,
        troco_inicial: Number.isFinite(troco) ? troco : 0,
      })
      onSetCaixaAtualId(String(novoCaixaId))
      onSetMensagem('Caixa aberto.')
    } catch (e) {
      onSetMensagem(formatarErro(e, 'Não foi possível abrir o caixa. Tente de novo.'))
    }
  }, [tauriDisponivel, onSetMensagem, onSetCaixaAtualId, formatarErro])

  const fecharCaixa = useCallback(async () => {
    if (!caixaAtualId) return
    try {
      const trocoRaw = window.prompt(
        'Valor em caixa para fechamento (R$):',
        String(totalLiquido.toFixed(2)),
      )
      const troco = trocoRaw ? Number(trocoRaw.replace(',', '.')) : 0
      await invoke('fechar_caixa_cmd', {
        caixa_id: caixaAtualId,
        troco_fechamento: Number.isFinite(troco) ? troco : 0,
      })
      onSetCaixaAtualId(null)
      onSetMensagem('Caixa fechado.')
    } catch (e) {
      onSetMensagem(formatarErro(e, 'Não foi possível fechar o caixa. Tente de novo.'))
    }
  }, [caixaAtualId, totalLiquido, onSetCaixaAtualId, onSetMensagem, formatarErro])

  const registrarMovimentoCaixa = useCallback(async () => {
    if (!caixaAtualId) return
    try {
      const tipo = window.prompt('Movimento de caixa (SANGRIA ou SUPRIMENTO):', 'SANGRIA')
      if (!tipo) return
      const valorRaw = window.prompt('Valor do movimento (R$):', '10')
      if (!valorRaw) return
      const valor = Number(valorRaw.replace(',', '.'))
      if (!Number.isFinite(valor) || valor <= 0) return
      await invoke('registrar_movimento_caixa_cmd', {
        caixa_id: caixaAtualId,
        tipo: tipo.toUpperCase(),
        valor,
        observacao: null,
      })
      onSetMensagem('Movimento registrado.')
    } catch (e) {
      onSetMensagem(formatarErro(e, 'Não foi possível registrar o movimento de caixa.'))
    }
  }, [caixaAtualId, onSetMensagem, formatarErro])

  const finalizarVenda = useCallback(async () => {
    if (!itens.length || isFinalizandoVenda) return
    setIsFinalizandoVenda(true)
    const t0Finalizar = performance.now()
    if (!tauriDisponivel) {
      onSetMensagem(
        'Execução fora do Tauri. Abra pelo app desktop (janela do Tauri), não pelo navegador em http://localhost:4173.',
      )
      setIsFinalizandoVenda(false)
      return
    }

    let caixaId = caixaAtualId
    if (!caixaId) {
      try {
        const atual = await invoke<CaixaSessaoInvoke | null>('load_caixa_atual_cmd')
        if (atual?.id) {
          caixaId = String(atual.id)
          onSetCaixaAtualId(caixaId)
        } else {
          caixaId = await invoke('abrir_caixa_cmd', {
            operador_id: null,
            troco_inicial: 0,
          })
          onSetCaixaAtualId(String(caixaId))
        }
      } catch (e) {
        onSetMensagem(formatarErro(e, 'Não foi possível preparar o caixa para a venda.'))
        setIsFinalizandoVenda(false)
        return
      }
    }

    try {
      await invoke('registrar_venda', {
        venda: {
          caixa_id: caixaId,
          operador_id: null,
          forma_pagamento: 'DINHEIRO',
          total_bruto: totalBruto,
          total_desconto: totalDesconto,
          total_liquido: totalLiquido,
          desconto_gerente_percentual: descontoGerentePercentual > 0 ? descontoGerentePercentual : null,
          desconto_gerente_valor: descontoGerentePercentual > 0 ? descontoGerenteValor : null,
          gerente_id: descontoGerentePercentual > 0 ? gerenteId : null,
          desconto_gerente_token: descontoGerentePercentual > 0 ? descontoGerenteToken : null,
          itens: itens.map((i) => ({
            produto_id: i.produtoId,
            nome: i.nome,
            quantidade: i.quantidade,
            preco_original: i.resultado.precoOriginal,
            preco_unitario: i.resultado.precoUnitario,
          })),
        },
      })
      onLimparCarrinho()
      try {
        await onSyncOutbox(50)
        await onRefreshOutboxResumo()
        onSetMensagem('Venda registrada e sincronizada (quando possível).')
      } catch {
        await onRefreshOutboxResumo()
        onSetMensagem('Venda registrada localmente. Sincronização pendente.')
      }
    } catch (e) {
      logError('Erro ao registrar venda no caixa local', { error: e })
      onSetMensagem(formatarErro(e, 'Não foi possível registrar a venda no caixa local.'))
    } finally {
      onFinalizarElapsedMs(performance.now() - t0Finalizar)
      setIsFinalizandoVenda(false)
    }
  }, [
    itens,
    isFinalizandoVenda,
    tauriDisponivel,
    onSetMensagem,
    caixaAtualId,
    onSetCaixaAtualId,
    formatarErro,
    totalBruto,
    totalDesconto,
    totalLiquido,
    descontoGerentePercentual,
    descontoGerenteValor,
    gerenteId,
    descontoGerenteToken,
    onLimparCarrinho,
    onSyncOutbox,
    onRefreshOutboxResumo,
    logError,
    onFinalizarElapsedMs,
  ])

  return {
    isFinalizandoVenda,
    abrirCaixa,
    fecharCaixa,
    registrarMovimentoCaixa,
    finalizarVenda,
  }
}
