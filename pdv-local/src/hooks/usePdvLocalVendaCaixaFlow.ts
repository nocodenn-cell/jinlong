import { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { validarPercentualPermitido } from '@core/managerDiscount/policy'
import type { CaixaSessaoInvoke } from './usePdvLocalCatalogo'
import { captureDesktopException, VENDA_EVENTS } from '../lib/sentry'
import {
  descontoGerenteCompativel,
  isFormaPagamentoDesktop,
  normalizarPagamentos,
  type FormaPagamentoDesktop,
  type LinhaPagamentoDesktop,
  type PagamentoOutbox,
} from '../lib/formaPagamento'

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
  /**
   * Teto autorizado para validação defensiva offline. Em geral provém de
   * `defaultPdvConfig.maxDescontoGerentePercentual` ou de cache local.
   * Quando ausente, o fluxo só valida a presença de token.
   */
  maxDescontoGerentePercentual?: number
  gerenteId: string
  /** Forma escolhida no cupom. Ausente = DINHEIRO (comportamento histórico). */
  formaPagamento?: FormaPagamentoDesktop
  /**
   * Pagamento combinado e/ou crédito parcelado. Ausente/vazio = forma única (`formaPagamento`), sem
   * `pagamentos` no payload — idêntico ao comportamento anterior.
   */
  pagamentos?: LinhaPagamentoDesktop[]
  /**
   * Login por PIN: operador no caixa agora (carimba venda/abertura). null/ausente = payload antigo (null).
   * O caixa é do terminal (opção A): a troca de operador não fecha nem reabre o caixa.
   */
  operadorId?: string | null
  /** Desconto autorizado por PIN do gerente: evento OVERRIDE_GERENTE (servidor aceita sem token de senha). */
  gerentePinEventoId?: string | null
  /** Comissão: vendedor escolhido. null/ausente = operador do caixa (payload idêntico ao antigo). */
  vendedorId?: string | null
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
  vendedorId,
  caixaAtualId,
  itens,
  totalBruto,
  totalDesconto,
  totalLiquido,
  descontoGerentePercentual,
  descontoGerenteValor,
  descontoGerenteToken,
  maxDescontoGerentePercentual,
  gerenteId,
  formaPagamento = 'DINHEIRO',
  pagamentos,
  operadorId = null,
  gerentePinEventoId = null,
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
      const trocoRaw = globalThis.prompt('Troco inicial do caixa (R$):', '0')
      const troco = trocoRaw ? Number(trocoRaw.replace(',', '.')) : 0
      const novoCaixaId = await invoke('abrir_caixa_cmd', {
        operador_id: operadorId,
        troco_inicial: Number.isFinite(troco) ? troco : 0,
      })
      onSetCaixaAtualId(String(novoCaixaId))
      onSetMensagem('Caixa aberto.')
    } catch (e) {
      onSetMensagem(formatarErro(e, 'Não foi possível abrir o caixa. Tente de novo.'))
    }
  }, [tauriDisponivel, onSetMensagem, onSetCaixaAtualId, formatarErro, operadorId])

  const fecharCaixa = useCallback(async () => {
    if (!caixaAtualId) return
    try {
      const trocoRaw = globalThis.prompt(
        'Valor em caixa para fechamento (R$):',
        String(totalLiquido.toFixed(2)),
      )
      const troco = trocoRaw ? Number(trocoRaw.replace(',', '.')) : 0
      const obsRaw = globalThis.prompt(
        'Observação de fechamento (opcional; ex.: divergência contagem):',
        '',
      )
      const fechamento_observacao =
        obsRaw != null && obsRaw.trim().length > 0 ? obsRaw.trim() : null
      await invoke('fechar_caixa_cmd', {
        caixa_id: caixaAtualId,
        troco_fechamento: Number.isFinite(troco) ? troco : 0,
        fechamento_observacao,
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
      const tipo = globalThis.prompt('Movimento de caixa (SANGRIA ou SUPRIMENTO):', 'SANGRIA')
      if (!tipo) return
      const valorRaw = globalThis.prompt('Valor do movimento (R$):', '10')
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

    if (!isFormaPagamentoDesktop(formaPagamento)) {
      onSetMensagem('Forma de pagamento inválida. Escolha Dinheiro, PIX, Crédito ou Débito.')
      setIsFinalizandoVenda(false)
      return
    }
    let pagamentosOutbox: PagamentoOutbox[] | undefined
    let formaEscalar: FormaPagamentoDesktop = formaPagamento
    if (pagamentos && pagamentos.length > 0) {
      const r = normalizarPagamentos(pagamentos, totalLiquido)
      if (!r.ok) {
        onSetMensagem(r.erro)
        setIsFinalizandoVenda(false)
        return
      }
      pagamentosOutbox = r.pagamentos
      formaEscalar = r.pagamentos[0].forma_pagamento
      if (descontoGerentePercentual > 0 && r.pagamentos.some((p) => p.forma_pagamento !== 'DINHEIRO')) {
        onSetMensagem('Desconto de gerente só vale para venda paga em dinheiro. Troque a forma ou remova o desconto.')
        setIsFinalizandoVenda(false)
        return
      }
    }
    if (!descontoGerenteCompativel(formaEscalar, descontoGerentePercentual)) {
      onSetMensagem('Desconto de gerente só vale para venda paga em dinheiro. Troque a forma ou remova o desconto.')
      setIsFinalizandoVenda(false)
      return
    }

    if (descontoGerentePercentual > 0) {
      if (!descontoGerenteToken && !gerentePinEventoId) {
        onSetMensagem('Desconto de gerente sem autorização. Repita a validação antes de finalizar.')
        setIsFinalizandoVenda(false)
        return
      }
      if (typeof maxDescontoGerentePercentual === 'number') {
        const checagem = validarPercentualPermitido(
          descontoGerentePercentual,
          maxDescontoGerentePercentual,
        )
        if (!checagem.ok) {
          onSetMensagem(
            `Desconto rejeitado pelo limite local (${maxDescontoGerentePercentual.toFixed(2)}%). Repita a validação.`,
          )
          setIsFinalizandoVenda(false)
          return
        }
      }
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
            operador_id: operadorId,
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
          operador_id: operadorId,
          ...(vendedorId ? { vendedor_id: vendedorId } : {}),
          forma_pagamento: formaEscalar,
          ...(pagamentosOutbox ? { pagamentos: pagamentosOutbox } : {}),
          total_bruto: totalBruto,
          total_desconto: totalDesconto,
          total_liquido: totalLiquido,
          desconto_gerente_percentual: descontoGerentePercentual > 0 ? descontoGerentePercentual : null,
          desconto_gerente_valor: descontoGerentePercentual > 0 ? descontoGerenteValor : null,
          gerente_id: descontoGerentePercentual > 0 ? gerenteId : null,
          desconto_gerente_token: descontoGerentePercentual > 0 ? descontoGerenteToken : null,
          ...(descontoGerentePercentual > 0 && gerentePinEventoId ? { gerente_pin_evento_id: gerentePinEventoId } : {}),
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
      captureDesktopException(e, {
        trace_id: caixaId ?? 'unknown-caixa',
        caixa_id: caixaId ?? undefined,
        total_liquido: totalLiquido,
        itens_count: itens.length,
        plataforma: 'desktop',
        evento: VENDA_EVENTS.ERRO_RPC_VENDA,
        extra: { layer: 'registrar_venda_tauri' },
      })
      onSetMensagem(formatarErro(e, 'Não foi possível registrar a venda no caixa local.'))
    } finally {
      onFinalizarElapsedMs(performance.now() - t0Finalizar)
      setIsFinalizandoVenda(false)
    }
  }, [
    formaPagamento,
    pagamentos,
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
    maxDescontoGerentePercentual,
    onLimparCarrinho,
    onSyncOutbox,
    onRefreshOutboxResumo,
    logError,
    onFinalizarElapsedMs,
    operadorId,
    gerentePinEventoId,
    vendedorId,
  ])

  return {
    isFinalizandoVenda,
    abrirCaixa,
    fecharCaixa,
    registrarMovimentoCaixa,
    finalizarVenda,
  }
}
