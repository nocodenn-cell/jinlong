import {
  normalizeHumanTelemetryPayload,
  type HumanTelemetryPayload,
  type ScanPipelineSink,
  type ScanProcessContext,
  type ScanProcessResult,
} from '../../../../shared-core/src/pdv/scan-pipeline'
import type { CarrinhoState } from '../../../../shared-core/src/stores/unifiedCartStore'
import { buscarProdutoParaCaixa } from '@/app/caixa/actions'
import { createClient } from '@/lib/supabase/client'
import type { Mensagens } from '@/i18n/getMessages'
import type { CaixaToastKind } from '@/app/caixa/hooks/useCaixaMensagens'
import { useCarrinhoStore } from '@/stores/carrinhoStore'
import { raceWithScanAbort } from './webCaixaScanAbort'

type SetCaixaMensagemFn = (
  text: string | null,
  options?: { kind?: CaixaToastKind; toast?: boolean },
) => void

function telBase(ctx: ScanProcessContext): Pick<HumanTelemetryPayload, 'scanId' | 'sequenceNumber' | 'ctx'> {
  const meta = ctx.scan.event.meta
  const sid = meta?.cupomSessionId
  const corr = meta?.correlationId ?? sid
  return {
    scanId: ctx.scan.event.id,
    sequenceNumber: ctx.scan.sequenceNumber,
    ctx: {
      ...(sid != null && sid !== '' ? { cupomSessionId: sid } : {}),
      ...(corr != null && `${corr}` !== '' ? { correlationId: corr } : {}),
    },
  }
}

/** Scan com `cupomSessionId` no meta: exige igualdade com o cupom ativo (novo cupom gera novo id). */
function staleCupomIfAny(ctx: ScanProcessContext, deps: WebCaixaScanDeps): ScanProcessResult | null {
  const sid = ctx.scan.event.meta?.cupomSessionId
  if (sid == null || sid === '') return null
  if (sid !== deps.getActiveCupomSessionId()) {
    return { ok: false, reason: 'stale_cupom' }
  }
  return null
}

export type WebCaixaScanDeps = {
  m: Mensagens
  setCaixaMensagem: SetCaixaMensagemFn
  /** Opcional: toast “código lido” só para leitura por scanner. */
  setCaixaMensagemScannerInfo?: SetCaixaMensagemFn
  setCodigo: (v: string) => void
  tocarFeedback: (kind: 'ok' | 'erro') => void
  /** Chamado quando o produto não é encontrado — acende borda vermelha no input. */
  onErroBusca?: () => void
  focarCampoBusca: () => void
  adicionarItem: CarrinhoState['adicionarItem']
  setCartOwnerForSession: CarrinhoState['setCartOwnerForSession']
  aplicarPrecoRpcParaLinha: (
    params: { produtoId: string; itemId: string; quantidade: number },
    opts?: { scanSignal?: AbortSignal },
  ) => Promise<void>
  /** Sessão operacional do cupom (novo cupom ⇒ novo id); usado com `meta.cupomSessionId` no enqueue. */
  getActiveCupomSessionId: () => string
  /** Telemetria humana (runtime + adapter); injetada por `useCaixaScanPipeline`. */
  telemetry?: ScanPipelineSink
}

/**
 * Processa uma leitura já serializada pelo pipeline (PR 2B).
 */
export async function runWebCaixaScanProcess(
  ctx: ScanProcessContext,
  deps: WebCaixaScanDeps,
): Promise<ScanProcessResult> {
  const { m, setCaixaMensagem, setCodigo, tocarFeedback, focarCampoBusca } = deps
  const signal = ctx.signal
  /** ID da linha afetada neste scan; null = nenhuma mutação pendente. */
  let linhaPendenteRollback: string | null = null
  /** null = nova linha (remover em rollback); number = linha existente (restaurar quantidade). */
  let quantidadeParaRollback: number | null = null
  const trimmed = ctx.scan.event.codigo.trim()
  if (!trimmed) {
    return { ok: false, reason: 'validation', message: 'Código vazio.' }
  }

  const source = ctx.scan.event.meta?.source
  if (source === 'scanner' && deps.setCaixaMensagemScannerInfo) {
    deps.setCaixaMensagemScannerInfo(`Código lido: ${trimmed}`, { kind: 'info' })
  }
  if (signal?.aborted) {
    return { ok: false, reason: 'aborted' }
  }

  try {
    const stale0 = staleCupomIfAny(ctx, deps)
    if (stale0) return stale0
    if (signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    setCaixaMensagem(null)
    const tBusca = Date.now()
    const buscaR = await raceWithScanAbort(signal, () => buscarProdutoParaCaixa(trimmed))
    if (!buscaR.ok) {
      return { ok: false, reason: 'aborted' }
    }
    const res = buscaR.value
    const dtBusca = Date.now() - tBusca
    deps.telemetry?.emitTelemetry(
      normalizeHumanTelemetryPayload({
        ...telBase(ctx),
        event: 'buscar_produto_duration_ms',
        at: Date.now(),
        durationMs: dtBusca,
      }),
    )

    if (signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    const stale1 = staleCupomIfAny(ctx, deps)
    if (stale1) return stale1

    if (!res.ok) {
      setCaixaMensagem(res.error, { kind: 'error' })
      tocarFeedback('erro')
      return { ok: false, reason: 'network', message: res.error }
    }

    if (res.status === 'nao_encontrado') {
      setCaixaMensagem(m.caixa.msg_produto_nao_encontrado_acao, { kind: 'warning' })
      tocarFeedback('erro')
      deps.onErroBusca?.()
      return { ok: false, reason: 'not_found' }
    }

    if (res.status === 'ambiguo') {
      setCaixaMensagem(res.mensagem, { kind: 'warning' })
      tocarFeedback('erro')
      deps.onErroBusca?.()
      return { ok: false, reason: 'ambiguous' }
    }

    if (signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    const stale2 = staleCupomIfAny(ctx, deps)
    if (stale2) return stale2

    const p = res.produto
    const q = p.quantidade_estoque
    const min = p.estoque_minimo
    let avisoEstoqueMsg: string | null = null
    if (q !== null && q < 1) {
      avisoEstoqueMsg = `${m.caixa.item_adicionado} ${m.caixa.estoque_baixo}`
    } else if (q !== null && min !== null && q <= min) {
      avisoEstoqueMsg = `${m.caixa.item_adicionado} ${m.caixa.estoque_abaixo_minimo}`
    }

    const sessionR = await raceWithScanAbort(signal, async () => {
      const supabase = createClient()
      return supabase.auth.getSession()
    })
    if (!sessionR.ok) {
      return { ok: false, reason: 'aborted' }
    }
    const {
      data: { session },
    } = sessionR.value
    const uid = session?.user?.id ?? null
    if (uid) {
      deps.setCartOwnerForSession(uid)
    }

    if (signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    const stale3 = staleCupomIfAny(ctx, deps)
    if (stale3) return stale3

    /**
     * Política P0: mutação do carrinho só é “confirmada” quando o scan termina com sucesso.
     * Merge: se já existe linha para o mesmo produto (não MANUAL/PROMOCAO), incrementa a
     * quantidade em vez de criar nova linha — rollback restaura a quantidade anterior.
     * New: cria nova linha — rollback remove.
     */
    const existingLine = useCarrinhoStore
      .getState()
      .itens.find(
        (i) =>
          i.produtoId === p.id &&
          i.resultado?.tipoPreco !== 'MANUAL' &&
          i.resultado?.tipoPreco !== 'PROMOCAO',
      )

    let linhaIdAtiva: string

    if (existingLine) {
      linhaIdAtiva = existingLine.id
      quantidadeParaRollback = existingLine.quantidade
      useCarrinhoStore.getState().alterarQuantidade(existingLine.id, existingLine.quantidade + 1)
    } else {
      linhaIdAtiva = `${p.id}-${Date.now()}`
      deps.adicionarItem({
        id: linhaIdAtiva,
        produtoId: p.id,
        nome: p.nome,
        quantidade: 1,
        precoUnitario: p.preco_varejo,
        precoOriginal: p.preco_varejo,
        resultado: {
          precoUnitario: p.preco_varejo,
          precoOriginal: p.preco_varejo,
          descontoUnitario: 0,
          tipoPreco: 'VAREJO',
        },
        metaPdv: {
          origem: p.origem,
          tem_nf: p.tem_nf,
          observacao: p.observacao,
          estoque_atual: p.quantidade_estoque,
          estoque_minimo: p.estoque_minimo,
          categoriaId: p.categoria_id,
          precoAtacado: p.preco_atacado,
          precoVarejoReferencia: p.preco_varejo,
        },
      })
    }
    linhaPendenteRollback = linhaIdAtiva

    const abandonarLinhaDoScan = () => {
      if (!linhaPendenteRollback) return
      if (quantidadeParaRollback !== null) {
        useCarrinhoStore.getState().alterarQuantidade(linhaPendenteRollback, quantidadeParaRollback)
      } else {
        useCarrinhoStore.getState().removerItem(linhaPendenteRollback)
      }
      linhaPendenteRollback = null
    }

    if (signal?.aborted) {
      abandonarLinhaDoScan()
      return { ok: false, reason: 'aborted' }
    }

    const linhaApos = useCarrinhoStore.getState().itens.find((i) => i.id === linhaIdAtiva)
    if (linhaApos) {
      const tp = linhaApos.resultado?.tipoPreco
      if (tp !== 'MANUAL' && tp !== 'PROMOCAO') {
        const tPricing = Date.now()
        const pricingR = await raceWithScanAbort(signal, () =>
          deps.aplicarPrecoRpcParaLinha(
            {
              produtoId: p.id,
              itemId: linhaApos.id,
              quantidade: linhaApos.quantidade,
            },
            { scanSignal: signal },
          ),
        )
        if (!pricingR.ok) {
          abandonarLinhaDoScan()
          return { ok: false, reason: 'aborted' }
        }
        deps.telemetry?.emitTelemetry(
          normalizeHumanTelemetryPayload({
            ...telBase(ctx),
            event: 'pricing_rpc_duration_ms',
            at: Date.now(),
            durationMs: Date.now() - tPricing,
          }),
        )
      }
    }

    if (signal?.aborted) {
      abandonarLinhaDoScan()
      return { ok: false, reason: 'aborted' }
    }

    const stale4 = staleCupomIfAny(ctx, deps)
    if (stale4) {
      abandonarLinhaDoScan()
      return stale4
    }

    // Item comprometido no carrinho — limpa o guard aqui para que o finally
    // não reverta. O bloco de UI abaixo tem try/catch próprio: falhas em
    // toast/telemetria/áudio retornam ok:true pois o item já foi adicionado.
    linhaPendenteRollback = null
    try {
      setCodigo('')
      if (avisoEstoqueMsg) {
        setCaixaMensagem(avisoEstoqueMsg, { kind: 'warning' })
      } else {
        setCaixaMensagem(m.caixa.msg_item_adicionado_toast, { kind: 'success' })
      }
      const ackAt = Date.now()
      deps.telemetry?.emitTelemetry(
        normalizeHumanTelemetryPayload({
          ...telBase(ctx),
          event: 'scan_to_visual_ack_ms',
          at: ackAt,
          durationMs: Math.max(0, ackAt - ctx.scan.event.receivedAt),
        }),
      )
      tocarFeedback('ok')
    } catch {
      // Feedback secundário falhou mas o item já está no carrinho — ok.
    }
    return { ok: true }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, reason: 'aborted' }
    }
    setCaixaMensagem(m.caixa.falha_busca, { kind: 'error' })
    tocarFeedback('erro')
    return { ok: false, reason: 'unknown', message: m.caixa.falha_busca }
  } finally {
    if (linhaPendenteRollback != null && linhaPendenteRollback !== '') {
      if (quantidadeParaRollback !== null) {
        useCarrinhoStore.getState().alterarQuantidade(linhaPendenteRollback, quantidadeParaRollback)
      } else {
        useCarrinhoStore.getState().removerItem(linhaPendenteRollback)
      }
      linhaPendenteRollback = null
    }
    focarCampoBusca()
  }
}
